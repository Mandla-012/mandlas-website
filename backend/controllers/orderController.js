// Checkout and order tracking.
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Offer = require('../models/Offer');
const { applyWallet } = require('../utils/wallet');
const { transition, completeOrder, cancelOrder, autoCompleteDue, shortId } = require('../utils/orderFlow');
const { isId, publicName } = require('../utils/helpers');
const { cleanText, normPhone, NAME_RE } = require('../utils/validators');
const { toCents } = require('../utils/money');
const { storeDelivery } = require('../utils/mappers');
const { PLATFORM_FEE_PERCENT, PROVINCES, AUTO_COMPLETE_DAYS } = require('../config/constants');

const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });

function readAddress(a) {
    a = a || {};
    const address = {
        fullName: cleanText(a.fullName, 80),
        phone: normPhone(a.phone),
        street: cleanText(a.street, 80),
        city: cleanText(a.city, 40),
        province: cleanText(a.province, 30),
        postalCode: cleanText(a.postalCode, 4)
    };
    if (!NAME_RE.test(address.fullName)) return { error: 'Enter the name of the person receiving the order.' };
    if (!address.phone) return { error: 'Enter a South African phone number so the courier can reach you.' };
    if (address.street.length < 3) return { error: 'Enter the street address.' };
    if (address.city.length < 2) return { error: 'Enter the city or town.' };
    if (!PROVINCES.includes(address.province)) return { error: 'Choose the province.' };
    if (!/^\d{4}$/.test(address.postalCode)) return { error: 'The postal code must be 4 digits.' };
    return { address };
}

const statusLabelFlow = { placed: 1, confirmed: 2, shipped: 3, delivered: 4, completed: 5 };

function mapOrder(o, role, me) {
    const store = o.store && o.store.name ? { id: String(o.store._id), name: o.store.name } : { id: String(o.store || ''), name: '' };
    const buyerDoc = o.user && o.user.fullName ? o.user : null;
    const d = o.delivery || {};
    const isCollection = d.type === 'collection';
    const actions = [];
    if (role === 'seller') {
        if (o.status === 'placed') actions.push('confirm', 'cancel');
        if (o.status === 'confirmed') actions.push('ship', 'cancel');
        if (o.status === 'shipped') actions.push('deliver');
    } else {
        if (o.status === 'placed') actions.push('cancel');
        if (o.status === 'shipped' || o.status === 'delivered') actions.push('receive');
    }
    return {
        id: String(o._id),
        shortId: shortId(o),
        role,
        status: o.status,
        step: statusLabelFlow[o.status] || 0,
        createdAt: o.createdAt,
        store,
        buyerName: o.address && o.address.fullName ? o.address.fullName : publicName(buyerDoc, me),
        items: (o.items || []).map((i) => ({ productId: String(i.productId), name: i.name, price: i.price, listPrice: i.listPrice, qty: i.qty, offer: !!i.offer })),
        subtotal: (o.subtotalCents != null ? o.subtotalCents : toCents(o.total || 0)) / 100,
        deliveryFee: (o.deliveryCents || 0) / 100,
        total: o.totalCents != null ? o.totalCents / 100 : o.total || 0,
        net: role === 'seller' && o.netCents != null ? o.netCents / 100 : undefined,
        fee: role === 'seller' && o.feeCents != null ? o.feeCents / 100 : undefined,
        delivery: d.label ? { label: d.label, type: d.type, minDays: d.minDays, maxDays: d.maxDays, isCollection } : null,
        address: !isCollection && o.address && o.address.street ? o.address : null,
        payment: o.payment || null,
        history: (o.history || []).map((h) => ({ status: h.status, by: h.by, note: h.note, at: h.at })),
        deliveredAt: o.deliveredAt || null,
        autoCompleteAt: o.deliveredAt ? new Date(new Date(o.deliveredAt).getTime() + AUTO_COMPLETE_DAYS * 86400000) : null,
        actions
    };
}

// ---------------- checkout ----------------
exports.create = async (req, res) => {
    const undo = { stock: [], offers: [], wallet: 0, orders: [] };
    const rollback = async () => {
        await Promise.all(undo.stock.map((s) => Product.updateOne({ _id: s.id }, { $inc: { quantity: s.qty } })));
        await Promise.all(undo.offers.map((id) => Offer.updateOne({ _id: id, status: 'used' }, { $set: { status: 'accepted' } })));
        if (undo.orders.length) await Order.deleteMany({ _id: { $in: undo.orders } });
        if (undo.wallet > 0) await applyWallet(req.userId, { available: undo.wallet, kind: 'refund', note: 'Checkout did not complete' });
    };
    const fail = async (status, message) => {
        await rollback();
        return bad(res, message, status);
    };

    try {
        const b = req.body || {};
        const items = b.items;
        if (!Array.isArray(items) || items.length === 0 || items.length > 30) return bad(res, 'Your cart is empty.');
        if (!['wallet', 'test'].includes(b.payment)) return bad(res, 'Choose how you want to pay.');

        // 1. read the cart (one line per product)
        const lines = new Map();
        for (const it of items) {
            const qty = it ? Number(it.qty) : NaN;
            if (!it || !isId(it.id) || !Number.isInteger(qty) || qty < 1 || qty > 20) return bad(res, 'Your cart has an invalid item.');
            if (lines.has(it.id)) return bad(res, 'The same item is in your cart twice.');
            if (it.offerId != null && (!isId(it.offerId) || qty !== 1)) return bad(res, 'An offer can only be used for 1 item.');
            lines.set(it.id, { qty, offerId: it.offerId || null });
        }

        // 2. load products, stores, offers
        const products = await Product.find({ _id: { $in: [...lines.keys()] } });
        if (products.length !== lines.size) return bad(res, 'An item in your cart is no longer available.');
        if (products.some((p) => p.owner.equals(req.userId))) return bad(res, "You can't buy your own listing.");
        if (products.some((p) => p.quantity < lines.get(String(p._id)).qty)) return bad(res, 'An item in your cart is out of stock. Remove it and try again.', 409);

        const stores = await Store.find({ _id: { $in: [...new Set(products.map((p) => String(p.store)))] } });
        const storeById = new Map(stores.map((s) => [String(s._id), s]));

        const offerIds = [...lines.values()].map((l) => l.offerId).filter(Boolean);
        const offers = offerIds.length
            ? await Offer.find({ _id: { $in: offerIds }, buyer: req.userId, status: 'accepted', expiresAt: { $gt: new Date() } })
            : [];
        const offerById = new Map(offers.map((o) => [String(o._id), o]));

        // 3. delivery choice per store
        const chosen = b.delivery && typeof b.delivery === 'object' ? b.delivery : {};
        const perStore = new Map();
        let needsAddress = false;
        for (const p of products) {
            const sid = String(p.store);
            if (!perStore.has(sid)) {
                const store = storeById.get(sid);
                if (!store) return bad(res, 'A store in your cart no longer exists.');
                const opt = storeDelivery(store).find((o) => o.id === chosen[sid]);
                if (!opt) return bad(res, `Choose a delivery option for ${store.name}.`);
                if (opt.type !== 'collection') needsAddress = true;
                perStore.set(sid, { store, opt, items: [], subtotalCents: 0 });
            }
        }
        let address;
        if (needsAddress) {
            const r = readAddress(b.address);
            if (r.error) return bad(res, r.error);
            address = r.address;
        }

        // 4. prices (an accepted offer replaces the asking price)
        for (const p of products) {
            const line = lines.get(String(p._id));
            let priceCents = toCents(p.price);
            let offer = null;
            if (line.offerId) {
                offer = offerById.get(line.offerId);
                if (!offer || String(offer.product) !== String(p._id)) return bad(res, 'Your offer price is no longer valid. It may have expired.', 409);
                priceCents = offer.priceCents;
            }
            const group = perStore.get(String(p.store));
            group.items.push({ productId: p._id, name: p.title, price: priceCents / 100, listPrice: p.price, qty: line.qty, offer: offer ? offer._id : undefined, priceCents });
            group.subtotalCents += priceCents * line.qty;
        }

        let grandCents = 0;
        for (const g of perStore.values()) {
            g.deliveryCents = toCents(g.opt.price);
            g.totalCents = g.subtotalCents + g.deliveryCents;
            g.feeCents = Math.round((g.subtotalCents * PLATFORM_FEE_PERCENT) / 100);
            g.netCents = g.totalCents - g.feeCents;
            grandCents += g.totalCents;
        }

        // 5. pay
        if (b.payment === 'wallet') {
            const w = await applyWallet(req.userId, { available: -grandCents, kind: 'purchase', note: 'Checkout' });
            if (!w) return bad(res, 'You do not have enough money in your wallet.', 402);
            undo.wallet = grandCents;
        }

        // 6. reserve stock, then use up the offers
        for (const p of products) {
            const qty = lines.get(String(p._id)).qty;
            const r = await Product.updateOne({ _id: p._id, quantity: { $gte: qty } }, { $inc: { quantity: -qty } });
            if (r.modifiedCount !== 1) return fail(409, `Sorry, "${p.title}" was just bought by someone else.`);
            undo.stock.push({ id: p._id, qty });
        }
        for (const offer of offers) {
            const r = await Offer.updateOne({ _id: offer._id, status: 'accepted', buyer: req.userId }, { $set: { status: 'used' } });
            if (r.modifiedCount !== 1) return fail(409, 'Your offer price was just used or expired.');
            undo.offers.push(offer._id);
        }

        // 7. one order per store
        const checkoutId = crypto.randomBytes(8).toString('hex');
        const created = [];
        for (const g of perStore.values()) {
            const o = await Order.create({
                checkoutId,
                user: req.userId,
                seller: g.store.owner,
                store: g.store._id,
                items: g.items.map(({ priceCents, ...rest }) => rest),
                subtotalCents: g.subtotalCents,
                deliveryCents: g.deliveryCents,
                feeCents: g.feeCents,
                totalCents: g.totalCents,
                netCents: g.netCents,
                total: g.totalCents / 100,
                delivery: { optionId: g.opt.id, type: g.opt.type, label: g.opt.label, priceCents: g.deliveryCents, minDays: g.opt.minDays, maxDays: g.opt.maxDays },
                address: g.opt.type !== 'collection' ? address : undefined,
                payment: { method: b.payment, status: 'paid' },
                status: 'placed',
                history: [{ status: 'placed', by: 'buyer', note: b.payment === 'wallet' ? 'Paid from wallet' : 'Paid (test mode)', at: new Date() }]
            });
            undo.orders.push(o._id);
            created.push({ order: o, store: g.store });
        }

        // 8. the sellers' money waits in "pending" until the buyer confirms
        for (const { order } of created) {
            const credited = await applyWallet(order.seller, { pending: order.netCents, kind: 'sale_pending', ref: order._id, note: `Order #${shortId(order)}` });
            if (!credited) console.error('Could not credit seller for order', String(order._id));
        }

        res.status(201).json({
            success: true,
            total: grandCents / 100,
            orders: created.map(({ order, store }) => ({ id: String(order._id), shortId: shortId(order), store: store.name, total: order.totalCents / 100 }))
        });
    } catch (error) {
        console.error(error);
        try { await rollback(); } catch (e) { console.error('rollback failed', e); }
        res.status(500).json({ success: false, message: 'Could not place your order. You were not charged.' });
    }
};

// ---------------- lists ----------------
exports.mine = async (req, res) => {
    try {
        await autoCompleteDue({ user: req.userId });
        const rows = await Order.find({ user: req.userId }).sort({ createdAt: -1 }).limit(60).populate('store', 'name');
        res.json({ success: true, orders: rows.map((o) => mapOrder(o, 'buyer', req.userId)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your orders.' });
    }
};

// The seller's tracker: pending (still to do) and history (finished)
exports.forStore = async (req, res) => {
    try {
        await autoCompleteDue({ seller: req.userId });
        const scope = req.query.scope === 'history' ? 'history' : 'pending';
        const statuses = scope === 'history' ? ['completed', 'cancelled'] : ['placed', 'confirmed', 'shipped', 'delivered'];
        const [rows, pendingCount, completed, pendingMoney] = await Promise.all([
            Order.find({ seller: req.userId, status: { $in: statuses } }).sort({ createdAt: -1 }).limit(60).populate('user', 'fullName privacy'),
            Order.countDocuments({ seller: req.userId, status: { $in: ['placed', 'confirmed', 'shipped', 'delivered'] } }),
            Order.find({ seller: req.userId, status: 'completed' }).select('netCents'),
            Order.find({ seller: req.userId, status: { $in: ['placed', 'confirmed', 'shipped', 'delivered'] } }).select('netCents')
        ]);
        const sum = (arr) => arr.reduce((s, o) => s + (o.netCents || 0), 0);
        res.json({
            success: true,
            scope,
            orders: rows.map((o) => mapOrder(o, 'seller', req.userId)),
            summary: { pendingCount, completedCount: completed.length, earned: sum(completed) / 100, pendingMoney: sum(pendingMoney) / 100 }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your store orders.' });
    }
};

// ---------------- moving an order along ----------------
exports.action = async (req, res) => {
    try {
        if (!isId(req.params.id)) return bad(res, 'Order not found.', 404);
        const action = req.body && req.body.action;
        const note = cleanText(req.body && req.body.note, 160);
        const order = await Order.findById(req.params.id);
        if (!order) return bad(res, 'Order not found.', 404);

        const role = order.seller && order.seller.equals(req.userId) ? 'seller' : order.user.equals(req.userId) ? 'buyer' : null;
        if (!role) return bad(res, 'Order not found.', 404);

        const done = (o) => res.json({ success: true, status: o.status });
        const stale = () => bad(res, 'This order has already moved on. Refresh and check its status.', 409);
        const wrongRole = () => bad(res, 'You cannot do that on this order.', 403);

        if (action === 'confirm') {
            if (role !== 'seller') return wrongRole();
            const o = await transition(order._id, ['placed'], 'confirmed', 'seller', note);
            return o ? done(o) : stale();
        }
        if (action === 'ship') {
            if (role !== 'seller') return wrongRole();
            const o = await transition(order._id, ['confirmed'], 'shipped', 'seller', note);
            return o ? done(o) : stale();
        }
        if (action === 'deliver') {
            if (role !== 'seller') return wrongRole();
            const o = await transition(order._id, ['shipped'], 'delivered', 'seller', note, { deliveredAt: new Date() });
            return o ? done(o) : stale();
        }
        if (action === 'receive') {
            if (role !== 'buyer') return wrongRole();
            const o = await completeOrder(order._id, 'buyer');
            return o ? done(o) : stale();
        }
        if (action === 'cancel') {
            const from = role === 'seller' ? ['placed', 'confirmed'] : ['placed'];
            const o = await cancelOrder(order._id, from, role, note || (role === 'seller' ? 'Cancelled by the seller' : 'Cancelled by the buyer'));
            return o ? done(o) : stale();
        }
        bad(res, 'Unknown action.');
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not update the order.' });
    }
};
