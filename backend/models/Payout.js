const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        amountCents: { type: Number, required: true, min: 1 },
        status: { type: String, enum: ['requested', 'paid', 'rejected', 'cancelled'], default: 'requested', index: true },
        auto: { type: Boolean, default: false },
        // Copy of the bank details at request time (account number stays encrypted)
        bank: { bankName: String, accountHolder: String, accountType: String, branchCode: String, last4: String, numberEnc: String },
        reference: String,
        reason: String,
        processedAt: Date
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payout', payoutSchema);
