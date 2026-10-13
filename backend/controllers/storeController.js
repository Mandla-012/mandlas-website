const Store = require('../models/Store');
const Product = require('../models/Product');
const User = require('../models/User');
const { isId, str, escapeRegex, publicName } = require('../utils/helpers');
const { storeDelivery, avatarInfo, mapDelivery } = require('../utils/mappers');

exports.list = async (req, res) => {
    try {
        const filter = {};
        if (typeof req.query.search === 'string' && req.query.search.trim()) {
            filter.name = new RegExp(escapeRegex(req.query.search.trim().slice(0, 40)), 'i');
        }
        const stores = await Store.find(filter).sort({ createdAt: -1 }).limit(60);
        const counts = await Product.aggregate([
            { $match: { store: { $in: stores.map((s) => s._id) }, quantity: { $gt: 0 } } },
            { $group: { _id: '$store', n: { $sum: 1 } } }
        ]);
        const map = new Map(counts.map((c) => [String(c._id), c.n]));
        res.json({
            success: true,
            stores: stores.map((s) => ({ id: String(s._id), name: s.name, description: s.description, items: map.get(String(s._id)) || 0 }))
        });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load stores.' });
    }
};

exports.getOne = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Store not found.' });
        const s = await Store.findById(req.params.id);
        if (!s) return res.status(404).json({ success: false, message: 'Store not found.' });
        const items = await Product.countDocuments({ store: s._id, quantity: { $gt: 0 } });
        const owner = await User.findById(s.owner);
        res.json({
            success: true,
            store: {
                id: String(s._id), name: s.name, description: s.description, items, createdAt: s.createdAt,
                delivery: storeDelivery(s),
                owner: owner ? { name: publicName(owner, req.userId), avatar: avatarInfo(owner) } : null
            }
        });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load the store.' });
    }
};

exports.mine = async (req, res) => {
    try {
        const s = await Store.findOne({ owner: req.userId });
        if (!s) return res.json({ success: true, store: null });
        res.json({ success: true, store: { id: String(s._id), name: s.name, description: s.description, delivery: s.deliveryOptions.map(mapDelivery) } });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load your store.' });
    }
};

exports.create = async (req, res) => {
    try {
        const name = str(req.body && req.body.name, 40);
        const description = str(req.body && req.body.description, 300);
        if (name.length < 2) return res.status(400).json({ success: false, message: 'Store name must be 2 to 40 characters.' });

        if (await Store.findOne({ owner: req.userId })) {
            return res.status(409).json({ success: false, message: 'You already have a store.' });
        }
        const s = await Store.create({ owner: req.userId, name, nameKey: name.toLowerCase(), description });
        res.status(201).json({ success: true, store: { id: String(s._id), name: s.name, description: s.description } });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'That store name is taken. Pick another.' });
        }
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not create your store.' });
    }
};
