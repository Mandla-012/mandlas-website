// Each store sets its own delivery options. Buyers see them on the product and choose one at checkout.
const Store = require('../models/Store');
const { DELIVERY_TYPES, MAX_DELIVERY_OPTIONS } = require('../config/constants');
const { cleanText } = require('../utils/validators');
const { toCents } = require('../utils/money');
const { mapDelivery } = require('../utils/mappers');
const { isId } = require('../utils/helpers');

exports.mine = async (req, res) => {
    try {
        const store = await Store.findOne({ owner: req.userId });
        if (!store) return res.json({ success: true, options: [] });
        res.json({ success: true, options: store.deliveryOptions.map(mapDelivery) });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load your delivery options.' });
    }
};

exports.add = async (req, res) => {
    try {
        const store = await Store.findOne({ owner: req.userId });
        if (!store) return res.status(400).json({ success: false, message: 'Open your store first.' });
        if (store.deliveryOptions.length >= MAX_DELIVERY_OPTIONS) {
            return res.status(400).json({ success: false, message: `You can have up to ${MAX_DELIVERY_OPTIONS} delivery options.` });
        }
        const b = req.body || {};
        const type = cleanText(b.type, 20);
        const label = cleanText(b.label, 40);
        const priceCents = toCents(b.price);
        const minDays = Number(b.minDays);
        const maxDays = Number(b.maxDays);
        const areas = cleanText(b.areas, 120);

        if (!DELIVERY_TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Choose a delivery type.' });
        if (label.length < 2) return res.status(400).json({ success: false, message: 'Give the option a name.' });
        if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 200000) {
            return res.status(400).json({ success: false, message: 'The delivery price must be between R0 and R2000.' });
        }
        if (type === 'collection' && priceCents !== 0) return res.status(400).json({ success: false, message: 'Collection is free.' });
        if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays || maxDays > 30) {
            return res.status(400).json({ success: false, message: 'Delivery time must be 0 to 30 days (the longest can not be shorter than the quickest).' });
        }

        store.deliveryOptions.push({ type, label, priceCents, minDays, maxDays, areas });
        await store.save();
        res.status(201).json({ success: true, options: store.deliveryOptions.map(mapDelivery) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not add the delivery option.' });
    }
};

exports.remove = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const r = await Store.updateOne({ owner: req.userId }, { $pull: { deliveryOptions: { _id: req.params.id } } });
        if (!r.modifiedCount) return res.status(404).json({ success: false, message: 'Option not found.' });
        const store = await Store.findOne({ owner: req.userId });
        res.json({ success: true, options: store.deliveryOptions.map(mapDelivery) });
    } catch {
        res.status(500).json({ success: false, message: 'Could not remove the option.' });
    }
};
