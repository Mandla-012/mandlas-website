// Account settings. Every change needs the one-time "verified" ticket (password + Face ID).
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Avatar = require('../models/Avatar');
const BankAccount = require('../models/BankAccount');
const Passkey = require('../models/Passkey');
const SecurityState = require('../models/SecurityState');
const { authorize } = require('../utils/stepUp');
const { audit } = require('../utils/audit');
const { encrypt } = require('../utils/crypto');
const { parseImage } = require('../utils/images');
const { bankUnlockAt } = require('../utils/payouts');
const { NAME_RE, cleanText, normPhone, normName } = require('../utils/validators');
const { publicUser } = require('../utils/mappers');
const { BANKS, ACCOUNT_TYPES, PROVINCES } = require('../config/constants');
const { DEV_SKIP_FACE_ID } = require('../config/env');

const bad = (res, message) => res.status(400).json({ success: false, message });
const isBool = (v) => typeof v === 'boolean';

exports.get = async (req, res) => {
    try {
        const [user, bank, passkeys, sec] = await Promise.all([
            User.findById(req.userId),
            BankAccount.findOne({ user: req.userId }),
            Passkey.find({ user: req.userId }).sort({ createdAt: 1 }),
            SecurityState.findOne({ user: req.userId })
        ]);
        if (!user) return res.status(401).json({ success: false, message: 'Please log in first.' });
        res.json({
            success: true,
            user: publicUser(user),
            profile: { fullName: user.fullName, bio: user.bio },
            contact: { email: user.email, phone: user.phone, address: user.address },
            bank: bank
                ? { bankName: bank.bankName, accountHolder: bank.accountHolder, accountType: bank.accountType, branchCode: bank.branchCode, last4: bank.last4, changedAt: bank.changedAt, payoutsUnlockAt: bankUnlockAt(bank) }
                : null,
            notifications: user.notifications,
            privacy: user.privacy,
            avatar: { has: user.avatarVersion > 0, verified: user.avatarVerified, verifiedAt: user.avatarVerifiedAt || null, v: user.avatarVersion },
            passkeys: passkeys.map((p) => ({ id: p.credentialId, label: p.label, createdAt: p.createdAt })),
            devSkip: DEV_SKIP_FACE_ID,
            activity: sec && sec.log ? sec.log.slice(-10).reverse() : [],
            banks: BANKS,
            accountTypes: ACCOUNT_TYPES,
            provinces: PROVINCES
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your settings.' });
    }
};

exports.profile = async (req, res) => {
    try {
        const fullName = cleanText(req.body && req.body.fullName, 80);
        const bio = cleanText(req.body && req.body.bio, 160);
        if (!NAME_RE.test(fullName)) return bad(res, 'Enter your real name (letters only, 2 to 80 characters).');
        if (!(await authorize(req, res))) return;
        await User.updateOne({ _id: req.userId }, { $set: { fullName, bio } });
        await audit(req.userId, 'profile_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your profile.' });
    }
};

exports.contact = async (req, res) => {
    try {
        const b = req.body || {};
        const phone = normPhone(b.phone);
        if (phone === null) return bad(res, 'Enter a South African number such as 082 123 4567.');
        const a = b.address || {};
        const address = {
            street: cleanText(a.street, 80),
            city: cleanText(a.city, 40),
            province: cleanText(a.province, 30),
            postalCode: cleanText(a.postalCode, 4)
        };
        const any = Object.values(address).some(Boolean);
        if (any) {
            if (address.street.length < 3) return bad(res, 'Enter your street address.');
            if (address.city.length < 2) return bad(res, 'Enter your city or town.');
            if (!PROVINCES.includes(address.province)) return bad(res, 'Choose your province.');
            if (!/^\d{4}$/.test(address.postalCode)) return bad(res, 'The postal code must be 4 digits.');
        }
        if (!(await authorize(req, res))) return;
        await User.updateOne({ _id: req.userId }, { $set: { phone, address } });
        await audit(req.userId, 'contact_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your contact details.' });
    }
};

exports.bank = async (req, res) => {
    try {
        const b = req.body || {};
        const user = await User.findById(req.userId);
        const bankName = cleanText(b.bankName, 40);
        const accountHolder = cleanText(b.accountHolder, 80);
        const accountType = cleanText(b.accountType, 20);
        const accountNumber = String(b.accountNumber || '').replace(/\s/g, '');
        const branchCode = String(b.branchCode || '').replace(/\s/g, '');

        if (!BANKS.includes(bankName)) return bad(res, 'Choose your bank.');
        if (!ACCOUNT_TYPES.includes(accountType)) return bad(res, 'Choose the account type.');
        if (!/^\d{6,16}$/.test(accountNumber)) return bad(res, 'The account number must be 6 to 16 digits.');
        if (!/^\d{6}$/.test(branchCode)) return bad(res, 'The branch code must be 6 digits.');
        if (!NAME_RE.test(accountHolder)) return bad(res, 'Enter the account holder name.');
        // The account must belong to the person using this profile
        if (normName(accountHolder) !== normName(user.fullName)) {
            return bad(res, `The account holder must match your profile name (${user.fullName}). Update your profile name first if needed.`);
        }

        if (!(await authorize(req, res))) return;
        await BankAccount.findOneAndUpdate(
            { user: req.userId },
            { $set: { bankName, accountHolder, accountType, branchCode, numberEnc: encrypt(accountNumber), last4: accountNumber.slice(-4), changedAt: new Date() } },
            { upsert: true, new: true }
        );
        await audit(req.userId, 'bank_account_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your bank account.' });
    }
};

exports.notifications = async (req, res) => {
    try {
        const b = req.body || {};
        const keys = ['offers', 'messages', 'orders', 'promotions'];
        if (!keys.every((k) => isBool(b[k]))) return bad(res, 'Invalid notification settings.');
        if (!(await authorize(req, res))) return;
        const set = {};
        keys.forEach((k) => { set['notifications.' + k] = b[k]; });
        await User.updateOne({ _id: req.userId }, { $set: set });
        await audit(req.userId, 'notifications_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your notification settings.' });
    }
};

exports.privacy = async (req, res) => {
    try {
        const b = req.body || {};
        const keys = ['allowOffers', 'allowMessages', 'showFullName'];
        if (!keys.every((k) => isBool(b[k]))) return bad(res, 'Invalid privacy settings.');
        if (!(await authorize(req, res))) return;
        const set = {};
        keys.forEach((k) => { set['privacy.' + k] = b[k]; });
        await User.updateOne({ _id: req.userId }, { $set: set });
        await audit(req.userId, 'privacy_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your privacy settings.' });
    }
};

// Profile picture. It earns the "Verified" tick only when it was taken live in the app
// right after the Face ID check. Gallery uploads are saved without the tick.
exports.avatar = async (req, res) => {
    try {
        const img = parseImage(req.body && req.body.image, 150 * 1024);
        if (!img) return bad(res, 'That picture is invalid or too large. Use a JPG, PNG or WebP photo.');
        const live = req.body.live === true;
        if (!(await authorize(req, res))) return;
        await Avatar.findOneAndUpdate(
            { user: req.userId },
            { $set: { data: img.data, contentType: img.contentType, verified: live, verifiedAt: live ? new Date() : undefined } },
            { upsert: true }
        );
        await User.updateOne(
            { _id: req.userId },
            { $set: { avatarVersion: Date.now(), avatarVerified: live, ...(live ? { avatarVerifiedAt: new Date() } : {}) } }
        );
        await audit(req.userId, live ? 'verified_photo_set' : 'photo_changed', req);
        res.json({ success: true, verified: live });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save your picture.' });
    }
};

exports.password = async (req, res) => {
    try {
        const next = req.body && typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
        if (next.length < 8 || next.length > 72) return bad(res, 'The new password must be 8 to 72 characters.');
        const user = await User.findById(req.userId);
        if (await bcrypt.compare(next, user.password)) return bad(res, 'Choose a password you have not used on this account.');
        if (!(await authorize(req, res))) return;
        await User.updateOne({ _id: req.userId }, { $set: { password: await bcrypt.hash(next, 12) } });
        await audit(req.userId, 'password_changed', req);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not change your password.' });
    }
};
