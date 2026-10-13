const mongoose = require('mongoose');

const bankSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        bankName: { type: String, required: true },
        accountHolder: { type: String, required: true, trim: true, maxlength: 80 },
        accountType: { type: String, required: true },
        branchCode: { type: String, required: true },
        numberEnc: { type: String, required: true }, // the account number, encrypted (AES-256-GCM)
        last4: { type: String, required: true },
        changedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

module.exports = mongoose.model('BankAccount', bankSchema);
