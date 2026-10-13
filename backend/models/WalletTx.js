const mongoose = require('mongoose');

const txSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        kind: { type: String, required: true }, // sale_pending, sale_released, sale_cancelled, purchase, refund, payout_requested, payout_refund
        availableDelta: { type: Number, default: 0 },
        pendingDelta: { type: Number, default: 0 },
        availableAfter: Number,
        pendingAfter: Number,
        ref: String,
        note: { type: String, default: '' }
    },
    { timestamps: true }
);

module.exports = mongoose.model('WalletTx', txSchema);
