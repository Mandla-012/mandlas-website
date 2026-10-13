const mongoose = require('mongoose');

// One row per Face ID / fingerprint / Windows Hello device a person has registered.
const passkeySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        credentialId: { type: String, required: true, unique: true },
        publicKey: { type: Buffer, required: true },
        counter: { type: Number, default: 0 },
        transports: { type: [String], default: [] },
        label: { type: String, trim: true, maxlength: 30, default: 'This device' },
        lastUsedAt: Date
    },
    { timestamps: true }
);

module.exports = mongoose.model('Passkey', passkeySchema);
