// The life of an order and where the money goes at each step.
//   placed -> confirmed -> shipped -> delivered -> completed   (or cancelled before shipping)
//   buyer pays            seller's money waits in "pending"      released to "available" on completion
const Order = require('../models/Order');
const Product = require('../models/Product');
const { applyWallet } = require('./wallet');
const { maybeAutoPayout } = require('./payouts');
const { AUTO_COMPLETE_DAYS } = require('../config/constants');

// Moves an order to a new status only if it is currently in one of the allowed statuses.
// Because it is a single atomic update, only one caller can win.
function transition(orderId, from, to, by, note = '', extra = {}) {
    return Order.findOneAndUpdate(
        { _id: orderId, status: { $in: from } },
        { $set: { status: to, ...extra }, $push: { history: { status: to, by, note, at: new Date() } } },
        { new: true }
    );
}

const shortId = (o) => String(o._id).slice(-6).toUpperCase();

async function completeOrder(orderId, by) {
    const o = await transition(orderId, ['shipped', 'delivered'], 'completed', by, '', { completedAt: new Date() });
    if (!o) return null;
    const moved = await applyWallet(o.seller, { pending: -o.netCents, available: o.netCents, kind: 'sale_released', ref: o._id, note: `Order #${shortId(o)} completed` });
    if (!moved) {
        // pending was already empty (should not happen), so just credit the money
        await applyWallet(o.seller, { available: o.netCents, kind: 'sale_released', ref: o._id, note: `Order #${shortId(o)} completed` });
    }
    await maybeAutoPayout(o.seller, o.netCents);
    return o;
}

async function cancelOrder(orderId, from, by, note) {
    const o = await transition(orderId, from, 'cancelled', by, note, { cancelledAt: new Date() });
    if (!o) return null;
    if (o.payment && o.payment.status === 'paid') {
        await applyWallet(o.user, { available: o.totalCents, kind: 'refund', ref: o._id, note: `Refund for order #${shortId(o)}` });
    }
    await applyWallet(o.seller, { pending: -o.netCents, kind: 'sale_cancelled', ref: o._id, note: `Order #${shortId(o)} cancelled` });
    await Promise.all(o.items.map((it) => Product.updateOne({ _id: it.productId }, { $inc: { quantity: it.qty } })));
    return o;
}

// Delivered orders that the buyer never confirmed complete by themselves after a week.
async function autoCompleteDue(filter) {
    const cutoff = new Date(Date.now() - AUTO_COMPLETE_DAYS * 24 * 3600 * 1000);
    const due = await Order.find({ ...filter, status: 'delivered', deliveredAt: { $lte: cutoff } }).limit(50);
    for (const o of due) await completeOrder(o._id, 'system');
}

module.exports = { transition, completeOrder, cancelOrder, autoCompleteDue, shortId };
