// "Verify it's you": password first, then Face ID (a passkey on this phone or computer).
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Passkey = require('../models/Passkey');
const SecurityState = require('../models/SecurityState');
const { webauthn, relyingParty } = require('../utils/webauthn');
const { issueStepUp, peekStepUp, authorize, stepUpRequired } = require('../utils/stepUp');
const { audit } = require('../utils/audit');
const { cleanText } = require('../utils/validators');
const { DEV_SKIP_FACE_ID } = require('../config/env');
const { MAX_PASSKEYS, PASSWORD_WINDOW_MINUTES } = require('../config/constants');

const minutes = (n) => new Date(Date.now() + n * 60 * 1000);

exports.status = async (req, res) => {
    try {
        const passkeys = await Passkey.find({ user: req.userId }).sort({ createdAt: 1 });
        res.json({
            success: true,
            hasPasskey: passkeys.length > 0,
            passkeys: passkeys.map((p) => ({ id: p.credentialId, label: p.label, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt || null })),
            devSkip: DEV_SKIP_FACE_ID,
            stepUpActive: await peekStepUp(req)
        });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load your security details.' });
    }
};

// Step 1: the password
exports.verifyPassword = async (req, res) => {
    try {
        const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
        const user = await User.findById(req.userId);
        if (!user) return res.status(401).json({ success: false, message: 'Please log in first.' });

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            return res.status(429).json({ success: false, message: 'Too many wrong passwords. Try again in 15 minutes.' });
        }

        if (!password || !(await bcrypt.compare(password, user.password))) {
            const u = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedPw: 1 } }, { new: true });
            if (u && u.failedPw >= 5) {
                await User.updateOne({ _id: user._id }, { $set: { failedPw: 0, lockedUntil: minutes(15) } });
            }
            await audit(user._id, 'identity_check_wrong_password', req);
            return res.status(401).json({ success: false, message: 'That password is not correct.' });
        }

        await User.updateOne({ _id: user._id }, { $set: { failedPw: 0 }, $unset: { lockedUntil: 1 } });
        await SecurityState.updateOne({ user: user._id }, { $set: { pwOkUntil: minutes(PASSWORD_WINDOW_MINUTES) } }, { upsert: true });

        // Development shortcut (never active in production): password alone is enough
        if (DEV_SKIP_FACE_ID) {
            await issueStepUp(res, user._id);
            await audit(user._id, 'identity_verified_dev_skip', req);
            return res.json({ success: true, devSkipped: true });
        }

        const passkeys = await Passkey.find({ user: user._id });
        if (!passkeys.length) return res.json({ success: true, hasPasskey: false });

        const { generateAuthenticationOptions } = await webauthn();
        const { rpID } = relyingParty(req);
        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'required',
            timeout: 60000,
            allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports }))
        });
        await SecurityState.updateOne(
            { user: user._id },
            { $set: { challenge: options.challenge, challengeKind: 'auth', challengeExpires: minutes(2) } }
        );
        res.json({ success: true, hasPasskey: true, options });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not start the identity check.' });
    }
};

// Step 2: Face ID
exports.verifyPasskey = async (req, res) => {
    try {
        const response = req.body && req.body.response;
        if (!response || typeof response.id !== 'string') return res.status(400).json({ success: false, message: 'Invalid request.' });

        const now = new Date();
        // The challenge can be answered only once, and only right after the password step
        const state = await SecurityState.findOneAndUpdate(
            { user: req.userId, challengeKind: 'auth', challengeExpires: { $gt: now }, pwOkUntil: { $gt: now } },
            { $unset: { challenge: 1, challengeKind: 1, challengeExpires: 1 } },
            { new: false }
        );
        if (!state || !state.challenge) {
            return res.status(401).json({ success: false, message: 'That check timed out. Start again.' });
        }

        const pk = await Passkey.findOne({ user: req.userId, credentialId: response.id });
        if (!pk) return res.status(401).json({ success: false, message: 'This device is not registered for your account.' });

        const { verifyAuthenticationResponse } = await webauthn();
        const { origin, rpID } = relyingParty(req);
        let result;
        try {
            result = await verifyAuthenticationResponse({
                response,
                expectedChallenge: state.challenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                requireUserVerification: true,
                credential: { id: pk.credentialId, publicKey: new Uint8Array(pk.publicKey), counter: pk.counter, transports: pk.transports }
            });
        } catch (e) {
            await audit(req.userId, 'face_id_failed', req);
            return res.status(401).json({ success: false, message: 'Face ID could not be verified.' });
        }
        if (!result.verified) {
            await audit(req.userId, 'face_id_failed', req);
            return res.status(401).json({ success: false, message: 'Face ID could not be verified.' });
        }

        await Passkey.updateOne({ _id: pk._id }, { $set: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
        await SecurityState.updateOne({ user: req.userId }, { $unset: { pwOkUntil: 1 } });
        await issueStepUp(res, req.userId);
        await audit(req.userId, 'identity_verified', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not verify Face ID.' });
    }
};

// Can this person add a Face ID device right now?
//  - first device: needs the password typed a moment ago
//  - more devices: needs the full password + Face ID check
async function mayRegister(req, count) {
    if (count === 0) {
        const st = await SecurityState.findOne({ user: req.userId });
        return !!(st && st.pwOkUntil && st.pwOkUntil > new Date());
    }
    return peekStepUp(req);
}

exports.registerOptions = async (req, res) => {
    try {
        const existing = await Passkey.find({ user: req.userId });
        if (existing.length >= MAX_PASSKEYS) return res.status(400).json({ success: false, message: `You can register up to ${MAX_PASSKEYS} devices.` });
        if (!(await mayRegister(req, existing.length))) {
            if (existing.length === 0) return res.status(403).json({ success: false, message: 'Enter your password first.' });
            return stepUpRequired(res);
        }

        const user = await User.findById(req.userId);
        const { generateRegistrationOptions } = await webauthn();
        const { rpID, rpName } = relyingParty(req);
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: user.fullName,
            userID: new Uint8Array(Buffer.from(String(user._id), 'hex')),
            attestationType: 'none',
            timeout: 60000,
            excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }
        });
        await SecurityState.updateOne(
            { user: req.userId },
            { $set: { challenge: options.challenge, challengeKind: 'register', challengeExpires: minutes(2) } },
            { upsert: true }
        );
        res.json({ success: true, options });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not start Face ID setup.' });
    }
};

exports.registerVerify = async (req, res) => {
    try {
        const response = req.body && req.body.response;
        if (!response || typeof response.id !== 'string') return res.status(400).json({ success: false, message: 'Invalid request.' });

        const count = await Passkey.countDocuments({ user: req.userId });
        if (count >= MAX_PASSKEYS) return res.status(400).json({ success: false, message: `You can register up to ${MAX_PASSKEYS} devices.` });
        if (!(await mayRegister(req, count))) return count === 0 ? res.status(403).json({ success: false, message: 'Enter your password first.' }) : stepUpRequired(res);

        const state = await SecurityState.findOneAndUpdate(
            { user: req.userId, challengeKind: 'register', challengeExpires: { $gt: new Date() } },
            { $unset: { challenge: 1, challengeKind: 1, challengeExpires: 1 } },
            { new: false }
        );
        if (!state || !state.challenge) return res.status(401).json({ success: false, message: 'That setup timed out. Start again.' });

        const { verifyRegistrationResponse } = await webauthn();
        const { origin, rpID } = relyingParty(req);
        let result;
        try {
            result = await verifyRegistrationResponse({ response, expectedChallenge: state.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Face ID setup could not be verified.' });
        }
        if (!result.verified) return res.status(400).json({ success: false, message: 'Face ID setup could not be verified.' });

        // Adding a second device uses up the verification ticket
        if (count > 0 && !(await authorize(req, res))) return;

        const c = result.registrationInfo.credential;
        try {
            await Passkey.create({
                user: req.userId,
                credentialId: c.id,
                publicKey: Buffer.from(c.publicKey),
                counter: c.counter || 0,
                transports: c.transports || response.response?.transports || [],
                label: cleanText(req.body.label, 30) || 'This device'
            });
        } catch (e) {
            if (e.code === 11000) return res.status(409).json({ success: false, message: 'This device is already registered.' });
            throw e;
        }
        await SecurityState.updateOne({ user: req.userId }, { $unset: { pwOkUntil: 1 } });
        await audit(req.userId, 'face_id_device_added', req);
        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your Face ID.' });
    }
};

exports.removePasskey = async (req, res) => {
    try {
        const id = String(req.params.id || '').slice(0, 300);
        const exists = await Passkey.exists({ user: req.userId, credentialId: id });
        if (!exists) return res.status(404).json({ success: false, message: 'Device not found.' });
        if (!(await authorize(req, res))) return;
        await Passkey.deleteOne({ user: req.userId, credentialId: id });
        await audit(req.userId, 'face_id_device_removed', req);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not remove the device.' });
    }
};
