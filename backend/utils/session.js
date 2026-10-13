// Login session = a signed token kept in an HttpOnly cookie.
const jwt = require('jsonwebtoken');
const { JWT_SECRET, IS_PROD } = require('../config/env');
const { DAY_MS } = require('../config/constants');

const cookieBase = {
    httpOnly: true, // browser JavaScript cannot read it (protects against XSS theft)
    secure: IS_PROD, // HTTPS only in production
    sameSite: 'lax' // blocks cross-site POSTs (CSRF)
};

function issueSession(res, user, remember) {
    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
        expiresIn: remember ? '30d' : '2h'
    });
    res.cookie('token', token, { ...cookieBase, ...(remember ? { maxAge: 30 * DAY_MS } : {}) });
}

function clearSession(res) {
    res.clearCookie('token', cookieBase);
    res.clearCookie('stepup', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', path: '/api' });
}

module.exports = { issueSession, clearSession };
