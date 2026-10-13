const mongoose = require('mongoose');

// All amounts are whole cents. "pending" is money from sales the buyer hasn't confirmed yet.
const walletSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        available: { type: Number, default: 0, min: 0 },
        pending: { type: Number, default: 0, min: 0 },
        autoPayout: { type: Boolean, default: false } // send released money straight to the bank
    },
    { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
