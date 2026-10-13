const mongoose = require('mongoose');

const text = (max) => ({ type: String, trim: true, maxlength: max, default: '' });
const flag = (def) => ({ type: Boolean, default: def });

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true, maxlength: 80 },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
        password: { type: String, required: true }, // always a bcrypt hash

        // Profile and contact details (changed only after Face ID + password)
        phone: text(20),
        bio: text(160),
        address: { street: text(80), city: text(40), province: text(30), postalCode: text(4) },

        notifications: { offers: flag(true), messages: flag(true), orders: flag(true), promotions: flag(false) },
        privacy: { allowOffers: flag(true), allowMessages: flag(true), showFullName: flag(false) },

        // The picture itself lives in the Avatar collection
        avatarVersion: { type: Number, default: 0 },
        avatarVerified: flag(false),
        avatarVerifiedAt: Date,

        // Wrong-password lockout used by the identity check
        failedPw: { type: Number, default: 0 },
        lockedUntil: Date
    },
    { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
