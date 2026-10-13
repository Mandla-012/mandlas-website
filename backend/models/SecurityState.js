const mongoose = require('mongoose');

// Short-lived security data for the identity check, plus a recent-activity log.
const securitySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        pwOkUntil: Date, // password was typed correctly a moment ago
        challenge: String, // WebAuthn challenge waiting to be answered
        challengeKind: String, // 'auth' | 'register'
        challengeExpires: Date,
        stepUpHash: String, // one-time "you verified yourself" ticket (hashed)
        stepUpExpires: Date,
        log: { type: [{ action: String, ip: String, at: Date, _id: false }], default: [] }
    },
    { timestamps: true }
);

module.exports = mongoose.model('SecurityState', securitySchema);
