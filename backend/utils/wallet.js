// Wallet bookkeeping. Every change is one atomic update that refuses to go below zero,
// followed by a line in the history (WalletTx).
const Wallet = require('../models/Wallet');
const WalletTx = require('../models/WalletTx');

async function ensureWallet(userId) {
    try {
        await Wallet.updateOne({ user: userId }, { $setOnInsert: { available: 0, pending: 0, autoPayout: false } }, { upsert: true });
    } catch (e) {
        if (e.code !== 11000) throw e; // someone else created it at the same moment
    }
}

// available / pending are signed cent amounts. Returns the new wallet, or null if funds are short.
async function applyWallet(userId, { available = 0, pending = 0, kind, ref, note = '' }) {
    await ensureWallet(userId);
    const filter = { user: userId };
    if (available < 0) filter.available = { $gte: -available };
    if (pending < 0) filter.pending = { $gte: -pending };
    const w = await Wallet.findOneAndUpdate(filter, { $inc: { available, pending } }, { new: true });
    if (!w) return null;
    await WalletTx.create({
        user: userId,
        kind,
        availableDelta: available,
        pendingDelta: pending,
        availableAfter: w.available,
        pendingAfter: w.pending,
        ref: ref ? String(ref) : undefined,
        note
    });
    return w;
}

module.exports = { ensureWallet, applyWallet };
