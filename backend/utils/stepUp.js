// The "verify it's you" ticket. Created after password + Face ID, valid for a few minutes,
// and used up by the first change that needs it.
const crypto = require('crypto');
const SecurityState = require('../models/SecurityState');
const { sha256 } = require('./crypto');
const { IS_PROD } = require('../config/env');
const { STEP_UP_MINUTES } = require('../config/constants');

const COOKIE = 'stepup';
const cookieOpts = { httpOnly: true, secure: IS_PROD, sameSite: 'strict', path: '/api' };

async function issueStepUp(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const ms = STEP_UP_MINUTES * 60 * 1000;
    await SecurityState.updateOne(
        { user: userId },
        { $set: { stepUpHash: sha256(token), stepUpExpires: new Date(Date.now() + ms) } },
        { upsert: true }
    );
    res.cookie(COOKIE, token, { ...cookieOpts, maxAge: ms });
}

const tokenFrom = (req) => {
    const t = req.cookies && req.cookies[COOKIE];
    return typeof t === 'string' && /^[a-f\d]{64}$/.test(t) ? t : null;
};

// Is there a valid ticket? (does not use it up)
async function peekStepUp(req) {
    const t = tokenFrom(req);
    if (!t) return false;
    return !!(await SecurityState.exists({ user: req.userId, stepUpHash: sha256(t), stepUpExpires: { $gt: new Date() } }));
}

// Uses the ticket up. Returns true only once per verification.
async function consumeStepUp(req, res) {
    const t = tokenFrom(req);
    if (!t) return false;
    const doc = await SecurityState.findOneAndUpdate(
        { user: req.userId, stepUpHash: sha256(t), stepUpExpires: { $gt: new Date() } },
        { $unset: { stepUpHash: 1, stepUpExpires: 1 } },
        { new: false }
    );
    if (doc && res) res.clearCookie(COOKIE, cookieOpts);
    return !!doc;
}

const stepUpRequired = (res) =>
    res.status(403).json({ success: false, code: 'STEP_UP_REQUIRED', message: 'Verify your identity first (password and Face ID).' });

// Call this after validating the input and before saving the change.
async function authorize(req, res) {
    if (await consumeStepUp(req, res)) return true;
    stepUpRequired(res);
    return false;
}

module.exports = { issueStepUp, peekStepUp, consumeStepUp, stepUpRequired, authorize };
