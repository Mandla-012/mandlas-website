const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

// Blocks the request unless the visitor has a valid login cookie.
function requireAuth(req, res, next) {
    try {
        const payload = jwt.verify(req.cookies.token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Please log in first.' });
    }
}

module.exports = { requireAuth };
