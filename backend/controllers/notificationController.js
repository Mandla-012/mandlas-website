// Small counters for the red dots on the Inbox tab.
const Offer = require('../models/Offer');
const Order = require('../models/Order');

exports.summary = async (req, res) => {
    try {
        const now = new Date();
        const [offersToBuyer, offersToSeller, ordersToHandle, ordersToConfirm] = await Promise.all([
            Offer.countDocuments({ buyer: req.userId, status: 'open', turn: 'buyer', expiresAt: { $gt: now } }),
            Offer.countDocuments({ seller: req.userId, status: 'open', turn: 'seller', expiresAt: { $gt: now } }),
            Order.countDocuments({ seller: req.userId, status: 'placed' }),
            Order.countDocuments({ user: req.userId, status: 'delivered' })
        ]);
        res.json({ success: true, offers: offersToBuyer + offersToSeller, orders: ordersToHandle + ordersToConfirm });
    } catch {
        res.json({ success: true, offers: 0, orders: 0 });
    }
};
