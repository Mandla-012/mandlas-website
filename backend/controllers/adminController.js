// Minimal payout desk for the people listed in ADMIN_EMAILS.
const Payout = require('../models/Payout');
const User = require('../models/User');
const { applyWallet } = require('../utils/wallet');
const { decrypt } = require('../utils/crypto');
const { isId, str } = require('../utils/helpers');
const { ADMIN_EMAILS } = require('../config/env');

exports.requireAdmin = async (req, res, next) => {
    try {
        const u = await User.findById(req.userId).select('email');
        if (!u || !ADMIN_EMAILS.includes(String(u.email).toLowerCase())) {
            return res.status(403).json({ success: false, message: 'Not allowed.' });
        }
        next();
    } catch {
        res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
};

exports.listPayouts = async (req, res) => {
    try {
        const status = ['requested', 'paid', 'rejected', 'cancelled'].includes(req.query.status) ? req.query.status : 'requested';
        const rows = await Payout.find({ status }).sort({ createdAt: 1 }).limit(100).populate('user', 'fullName email');
        res.json({
            success: true,
            payouts: rows.map((p) => ({
                id: String(p._id),
                amount: p.amountCents / 100,
                status: p.status,
                auto: p.auto,
                createdAt: p.createdAt,
                user: p.user ? { name: p.user.fullName, email: p.user.email } : null,
                bank: { bankName: p.bank.bankName, accountHolder: p.bank.accountHolder, accountType: p.bank.accountType, branchCode: p.bank.branchCode, accountNumber: decrypt(p.bank.numberEnc) },
                reference: p.reference || ''
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load payouts.' });
    }
};

exports.markPaid = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const reference = str(req.body && req.body.reference, 60);
        const p = await Payout.findOneAndUpdate({ _id: req.params.id, status: 'requested' }, { $set: { status: 'paid', reference, processedAt: new Date() } }, { new: true });
        if (!p) return res.status(404).json({ success: false, message: 'Already processed.' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not update the payout.' });
    }
};

exports.reject = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const reason = str(req.body && req.body.reason, 120);
        const p = await Payout.findOneAndUpdate({ _id: req.params.id, status: 'requested' }, { $set: { status: 'rejected', reason, processedAt: new Date() } }, { new: true });
        if (!p) return res.status(404).json({ success: false, message: 'Already processed.' });
        await applyWallet(p.user, { available: p.amountCents, kind: 'payout_refund', ref: p._id, note: 'Withdrawal rejected' + (reason ? `: ${reason}` : '') });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not update the payout.' });
    }
};
