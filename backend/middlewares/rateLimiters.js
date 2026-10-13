const rateLimit = require('express-rate-limit');

const make = (max, message) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => process.env.NODE_ENV === 'test', // automatic tests only
        message: { success: false, message }
    });

module.exports = {
    authLimiter: make(20, 'Too many attempts. Try again in 15 minutes.'),
    writeLimiter: make(100, 'Slow down a little and try again soon.'),
    // Password / Face ID checks and money movements
    strictLimiter: make(20, 'Too many verification attempts. Try again in 15 minutes.')
};
