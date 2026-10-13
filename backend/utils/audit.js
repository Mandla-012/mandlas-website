// Keeps the last 20 security events (verifications, setting changes) for each person.
const SecurityState = require('../models/SecurityState');

async function audit(userId, action, req) {
    try {
        await SecurityState.updateOne(
            { user: userId },
            { $push: { log: { $each: [{ action, ip: (req && (req.ip || (req.socket && req.socket.remoteAddress))) || '', at: new Date() }], $slice: -20 } } },
            { upsert: true }
        );
    } catch (e) {
        console.error('audit failed', e.message);
    }
}

module.exports = { audit };
