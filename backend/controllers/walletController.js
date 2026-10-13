const Wallet = require('../models/Wallet');
const WalletTx = require('../models/WalletTx');
const Payout = require('../models/Payout');
const BankAccount = require('../models/BankAccount');
const { ensureWallet, applyWallet } = require('../utils/wallet');
const { createPayout, bankUnlockAt } = require('../utils/payouts');
const { authorize } = require('../utils/stepUp');
const { audit } = require('../utils/audit');
const { MIN_PAYOUT_CENTS } = require('../config/constants');
const { toCents } = require('../utils/money');
const { isId } = require('../utils/helpers');

const mapPayout = (p) => ({
    id: String(p._id),
    amount: p.amountCents / 100,
    status: p.status,
    auto: p.auto,
    bank: p.bank ? { bankName: p.bank.bankName, last4: p.bank.last4 } : null,
    reference: p.reference || '',
    reason: p.reason || '',
    createdAt: p.createdAt,
    processedAt: p.processedAt || null
});

exports.get = async (req, res) => {
    try {
        await ensureWallet(req.userId);
        const [wallet, bank, tx, payouts] = await Promise.all([
            Wallet.findOne({ user: req.userId }),
            BankAccount.findOne({ user: req.userId }),
            WalletTx.find({ user: req.userId }).sort({ createdAt: -1 }).limit(40),
            Payout.find({ user: req.userId }).sort({ createdAt: -1 }).limit(20)
        ]);
        res.json({
            success: true,
            wallet: { available: wallet.available / 100, pending: wallet.pending / 100, autoPayout: wallet.autoPayout },
            minPayout: MIN_PAYOUT_CENTS / 100,
            bank: bank ? { bankName: bank.bankName, last4: bank.last4, accountType: bank.accountType, payoutsUnlockAt: bankUnlockAt(bank) } : null,
            transactions: tx.map((t) => ({
                id: String(t._id), kind: t.kind, available: t.availableDelta / 100, pending: t.pendingDelta / 100, note: t.note, createdAt: t.createdAt
            })),
            payouts: payouts.map(mapPayout)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your wallet.' });
    }
};

// Withdraw to the bank account (needs password + Face ID)
exports.withdraw = async (req, res) => {
    try {
        const amountCents = toCents(req.body && req.body.amount);
        if (!Number.isFinite(amountCents) || amountCents < MIN_PAYOUT_CENTS) {
            return res.status(400).json({ success: false, message: `The minimum withdrawal is R${MIN_PAYOUT_CENTS / 100}.` });
        }
        const [wallet, bank] = await Promise.all([Wallet.findOne({ user: req.userId }), BankAccount.findOne({ user: req.userId })]);
        if (!bank) return res.status(400).json({ success: false, message: 'Add your bank account in Settings first.' });
        if (!wallet || wallet.available < amountCents) return res.status(400).json({ success: false, message: 'You do not have that much available.' });
        if (bankUnlockAt(bank) > new Date()) {
            return res.status(403).json({ success: false, message: `For your safety, withdrawals unlock on ${bankUnlockAt(bank).toLocaleString('en-ZA')}.` });
        }
        if (!(await authorize(req, res))) return;
        const result = await createPayout(req.userId, amountCents);
        if (result.error) return res.status(400).json({ success: false, message: result.error });
        await audit(req.userId, 'withdrawal_requested', req);
        res.status(201).json({ success: true, payout: mapPayout(result.payout) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not request the withdrawal.' });
    }
};

// Keep money in the wallet (default) or send every release straight to the bank
exports.autoPayout = async (req, res) => {
    try {
        const enabled = req.body && req.body.enabled;
        if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: 'Invalid setting.' });
        if (enabled && !(await BankAccount.exists({ user: req.userId }))) {
            return res.status(400).json({ success: false, message: 'Add your bank account in Settings first.' });
        }
        if (!(await authorize(req, res))) return;
        await ensureWallet(req.userId);
        await Wallet.updateOne({ user: req.userId }, { $set: { autoPayout: enabled } });
        await audit(req.userId, enabled ? 'auto_payout_on' : 'auto_payout_off', req);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not save that setting.' });
    }
};

// Changed your mind before the payout was processed? Cancel it and the money returns to the wallet.
exports.cancelPayout = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const p = await Payout.findOneAndUpdate(
            { _id: req.params.id, user: req.userId, status: 'requested' },
            { $set: { status: 'cancelled', processedAt: new Date() } },
            { new: true }
        );
        if (!p) return res.status(404).json({ success: false, message: 'That withdrawal can no longer be cancelled.' });
        await applyWallet(req.userId, { available: p.amountCents, kind: 'payout_refund', ref: p._id, note: 'Withdrawal cancelled' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not cancel the withdrawal.' });
    }
};

exports.mapPayout = mapPayout;
