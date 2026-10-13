const BankAccount = require('../models/BankAccount');
const Payout = require('../models/Payout');
const Wallet = require('../models/Wallet');
const { applyWallet } = require('./wallet');
const { MIN_PAYOUT_CENTS } = require('../config/constants');
const { BANK_COOLDOWN_HOURS } = require('../config/env');
const { fmt } = require('./money');

const bankUnlockAt = (bank) => new Date(new Date(bank.changedAt).getTime() + BANK_COOLDOWN_HOURS * 3600 * 1000);

// Moves money from the wallet into a payout request that an admin then pays by EFT.
async function createPayout(userId, amountCents, { auto = false } = {}) {
    const bank = await BankAccount.findOne({ user: userId });
    if (!bank) return { error: 'Add your bank account in Settings first.' };
    const unlock = bankUnlockAt(bank);
    if (unlock > new Date()) {
        return { error: `For your safety, withdrawals unlock on ${unlock.toLocaleString('en-ZA')} (after a bank account change).` };
    }
    if (!Number.isInteger(amountCents) || amountCents < MIN_PAYOUT_CENTS) {
        return { error: `The minimum withdrawal is ${fmt(MIN_PAYOUT_CENTS)}.` };
    }
    const wallet = await applyWallet(userId, { available: -amountCents, kind: 'payout_requested', note: auto ? 'Automatic payout to your bank' : 'Withdrawal to your bank' });
    if (!wallet) return { error: 'You do not have enough available money.' };

    try {
        const payout = await Payout.create({
            user: userId,
            amountCents,
            auto,
            bank: { bankName: bank.bankName, accountHolder: bank.accountHolder, accountType: bank.accountType, branchCode: bank.branchCode, last4: bank.last4, numberEnc: bank.numberEnc }
        });
        return { payout, wallet };
    } catch (e) {
        await applyWallet(userId, { available: amountCents, kind: 'payout_refund', note: 'Payout could not be created' });
        console.error(e);
        return { error: 'Could not create the withdrawal. Your money is back in your wallet.' };
    }
}

// After money is released to a seller: send it on to their bank if they asked for that.
async function maybeAutoPayout(userId, amountCents) {
    try {
        const w = await Wallet.findOne({ user: userId });
        if (!w || !w.autoPayout || amountCents < MIN_PAYOUT_CENTS) return;
        await createPayout(userId, amountCents, { auto: true }); // quietly stays in the wallet if the bank is locked
    } catch (e) {
        console.error('auto payout failed', e.message);
    }
}

module.exports = { createPayout, maybeAutoPayout, bankUnlockAt };
