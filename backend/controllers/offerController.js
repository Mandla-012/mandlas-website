// Price offers: a buyer offers less, the seller accepts / declines / counters.
// A seller can also send a special price to everyone who saved the item to their favourites.
const Offer = require('../models/Offer');
const Product = require('../models/Product');
const Favourite = require('../models/Favourite');
const User = require('../models/User');
const { isId, str, publicName } = require('../utils/helpers');
const { toCents } = require('../utils/money');
const { OFFER_MIN_PERCENT, OFFER_OPEN_HOURS, OFFER_LOCK_HOURS, OFFER_MAX_ROUNDS } = require('../config/constants');

const hours = (h) => new Date(Date.now() + h * 3600 * 1000);
const ACTIVE = ['open', 'accepted'];
const priceRange = (listCents) => ({ min: Math.max(100, Math.ceil((listCents * OFFER_MIN_PERCENT) / 100)), max: listCents });

async function expireOld() {
    await Offer.updateMany({ status: { $in: ACTIVE }, expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
}

function mapOffer(o, me) {
    const role = String(o.buyer._id || o.buyer) === String(me) ? 'buyer' : 'seller';
    const product = o.product && o.product.title ? o.product : null;
    return {
        id: String(o._id),
        role,
        status: o.status,
        turn: o.turn,
        canRespond: o.status === 'open' && o.turn === role,
        source: o.source,
        rounds: o.rounds,
        price: o.priceCents / 100,
        listPrice: o.listPriceCents / 100,
        expiresAt: o.expiresAt,
        createdAt: o.createdAt,
        history: o.history.map((h) => ({ by: h.by, price: h.priceCents / 100, note: h.note, at: h.at })),
        product: product ? { id: String(product._id), title: product.title, quantity: product.quantity, imageCount: product.imageCount } : { id: String(o.product._id || o.product), title: 'Removed listing', quantity: 0, imageCount: 0 },
        buyerName: publicName(o.buyer.fullName ? o.buyer : null, me),
        sellerName: publicName(o.seller.fullName ? o.seller : null, me)
    };
}

exports.list = async (req, res) => {
    try {
        await expireOld();
        const q = { $or: [{ buyer: req.userId }, { seller: req.userId }] };
        if (isId(req.query.productId)) q.product = req.query.productId;
        const rows = await Offer.find(q).sort({ updatedAt: -1 }).limit(100).populate('product', 'title quantity imageCount').populate('buyer', 'fullName privacy').populate('seller', 'fullName privacy');
        res.json({ success: true, offers: rows.filter((o) => o.buyer && o.seller).map((o) => mapOffer(o, req.userId)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your offers.' });
    }
};

// A buyer makes an offer
exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        if (!isId(b.productId)) return res.status(400).json({ success: false, message: 'Invalid listing.' });
        const priceCents = toCents(b.price);
        const product = await Product.findById(b.productId);
        if (!product) return res.status(404).json({ success: false, message: 'That listing no longer exists.' });
        if (product.owner.equals(req.userId)) return res.status(400).json({ success: false, message: "That's your own listing." });
        if (product.quantity < 1) return res.status(400).json({ success: false, message: 'This item is sold.' });

        const listCents = toCents(product.price);
        const { min } = priceRange(listCents);
        if (!Number.isInteger(priceCents) || priceCents < min || priceCents >= listCents) {
            return res.status(400).json({ success: false, message: `Offer between R${min / 100} and R${(listCents - 100) / 100} (the asking price is R${product.price}).` });
        }

        await expireOld();
        if (await Offer.exists({ product: product._id, buyer: req.userId, status: { $in: ACTIVE } })) {
            return res.status(409).json({ success: false, message: 'You already have an active offer on this item.' });
        }
        const offer = await Offer.create({
            product: product._id, store: product.store, seller: product.owner, buyer: req.userId,
            listPriceCents: listCents, priceCents, turn: 'seller', status: 'open', source: 'buyer',
            history: [{ by: 'buyer', priceCents, note: str(b.note, 200) }], expiresAt: hours(OFFER_OPEN_HOURS)
        });
        res.status(201).json({ success: true, id: String(offer._id) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not send your offer.' });
    }
};

// Accept, decline or counter. Only the person whose turn it is can answer.
exports.respond = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const action = req.body && req.body.action;
        await expireOld();
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found.' });

        const me = String(req.userId);
        const role = String(offer.buyer) === me ? 'buyer' : String(offer.seller) === me ? 'seller' : null;
        if (!role) return res.status(404).json({ success: false, message: 'Offer not found.' });
        if (offer.status !== 'open') return res.status(409).json({ success: false, message: 'This offer is no longer open.' });
        if (offer.turn !== role) return res.status(403).json({ success: false, message: 'It is not your turn to answer this offer.' });

        const note = str(req.body.note, 200);
        const guard = { _id: offer._id, status: 'open', turn: role };

        if (action === 'decline') {
            const o = await Offer.findOneAndUpdate(guard, { $set: { status: 'declined' }, $push: { history: { by: role, priceCents: offer.priceCents, note: note || 'Declined', at: new Date() } } }, { new: true });
            return o ? res.json({ success: true }) : res.status(409).json({ success: false, message: 'This offer just changed.' });
        }

        if (action === 'accept') {
            const product = await Product.findById(offer.product);
            if (!product || product.quantity < 1) return res.status(409).json({ success: false, message: 'This item is no longer available.' });
            const o = await Offer.findOneAndUpdate(guard, { $set: { status: 'accepted', expiresAt: hours(OFFER_LOCK_HOURS) }, $push: { history: { by: role, priceCents: offer.priceCents, note: note || 'Accepted', at: new Date() } } }, { new: true });
            return o ? res.json({ success: true, lockedUntil: o.expiresAt }) : res.status(409).json({ success: false, message: 'This offer just changed.' });
        }

        if (action === 'counter') {
            if (offer.rounds >= OFFER_MAX_ROUNDS) return res.status(400).json({ success: false, message: 'This negotiation has reached its limit. Accept or decline.' });
            const priceCents = toCents(req.body.price);
            const { min, max } = priceRange(offer.listPriceCents);
            if (!Number.isInteger(priceCents) || priceCents < min || priceCents > max || priceCents === offer.priceCents) {
                return res.status(400).json({ success: false, message: `Counter between R${min / 100} and R${max / 100}, and different from the current price.` });
            }
            const o = await Offer.findOneAndUpdate(
                guard,
                { $set: { priceCents, turn: role === 'buyer' ? 'seller' : 'buyer', expiresAt: hours(OFFER_OPEN_HOURS) }, $inc: { rounds: 1 }, $push: { history: { by: role, priceCents, note, at: new Date() } } },
                { new: true }
            );
            return o ? res.json({ success: true }) : res.status(409).json({ success: false, message: 'This offer just changed.' });
        }

        res.status(400).json({ success: false, message: 'Choose accept, decline or counter.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not answer the offer.' });
    }
};

// The buyer withdraws an offer (also frees the reserved price)
exports.cancel = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const o = await Offer.findOneAndUpdate({ _id: req.params.id, buyer: req.userId, status: { $in: ACTIVE } }, { $set: { status: 'cancelled' } }, { new: true });
        if (!o) return res.status(404).json({ success: false, message: 'Nothing to cancel.' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not cancel the offer.' });
    }
};

async function audienceFor(product) {
    const favs = await Favourite.find({ product: product._id }).limit(500);
    const users = await User.find({ _id: { $in: favs.map((f) => f.user) } });
    const reachable = users.filter((u) => !product.owner.equals(u._id) && u.privacy.allowOffers !== false && u.notifications.offers !== false);
    return { total: favs.length, reachable };
}

// How many people saved this item, and how many of them accept offers (seller only)
exports.audience = async (req, res) => {
    try {
        if (!isId(req.params.productId)) return res.status(404).json({ success: false, message: 'Not found.' });
        const product = await Product.findOne({ _id: req.params.productId, owner: req.userId });
        if (!product) return res.status(404).json({ success: false, message: 'Listing not found.' });
        const a = await audienceFor(product);
        const wait = product.lastBroadcastAt ? Math.max(0, product.lastBroadcastAt.getTime() + 24 * 3600 * 1000 - Date.now()) : 0;
        res.json({ success: true, saved: a.total, reachable: a.reachable.length, waitMs: wait });
    } catch {
        res.status(500).json({ success: false, message: 'Could not check who saved this item.' });
    }
};

// The seller sends a special price to everyone who saved the item (once a day per item)
exports.broadcast = async (req, res) => {
    try {
        const b = req.body || {};
        if (!isId(b.productId)) return res.status(400).json({ success: false, message: 'Invalid listing.' });
        const product = await Product.findOne({ _id: b.productId, owner: req.userId });
        if (!product) return res.status(404).json({ success: false, message: 'Listing not found.' });
        if (product.quantity < 1) return res.status(400).json({ success: false, message: 'This item is sold.' });

        const listCents = toCents(product.price);
        const priceCents = toCents(b.price);
        const { min } = priceRange(listCents);
        if (!Number.isInteger(priceCents) || priceCents < min || priceCents >= listCents) {
            return res.status(400).json({ success: false, message: `The special price must be between R${min / 100} and R${(listCents - 100) / 100}.` });
        }

        // Claim today's broadcast (one per item per 24 hours)
        const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
        const claimed = await Product.findOneAndUpdate(
            { _id: product._id, $or: [{ lastBroadcastAt: { $exists: false } }, { lastBroadcastAt: { $lte: cutoff } }] },
            { $set: { lastBroadcastAt: new Date() } },
            { new: true }
        );
        if (!claimed) return res.status(429).json({ success: false, message: 'You can send one special offer per item every 24 hours.' });

        await expireOld();
        const { total, reachable } = await audienceFor(product);
        const busy = await Offer.find({ product: product._id, buyer: { $in: reachable.map((u) => u._id) }, status: { $in: ACTIVE } }).select('buyer');
        const busySet = new Set(busy.map((o) => String(o.buyer)));
        const targets = reachable.filter((u) => !busySet.has(String(u._id)));

        if (targets.length) {
            await Offer.insertMany(
                targets.map((u) => ({
                    product: product._id, store: product.store, seller: product.owner, buyer: u._id,
                    listPriceCents: listCents, priceCents, turn: 'buyer', status: 'open', source: 'seller_broadcast',
                    history: [{ by: 'seller', priceCents, note: str(b.note, 200) || 'Special price for people who saved this item' }],
                    expiresAt: hours(OFFER_OPEN_HOURS)
                }))
            );
        }
        res.status(201).json({ success: true, sent: targets.length, saved: total, skipped: total - targets.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not send your offer.' });
    }
};
