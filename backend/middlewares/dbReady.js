const mongoose = require('mongoose');

// If the database is down, say so clearly instead of hanging.
module.exports = function dbReady(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            success: false,
            message: 'The shop database is not connected yet. Check the server terminal for the reason.'
        });
    }
    next();
};
