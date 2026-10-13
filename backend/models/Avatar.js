const mongoose = require('mongoose');

const avatarSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        data: { type: Buffer, required: true },
        contentType: { type: String, required: true },
        verified: { type: Boolean, default: false }, // taken live in the app after the Face ID check
        verifiedAt: Date
    },
    { timestamps: true }
);

module.exports = mongoose.model('Avatar', avatarSchema);
