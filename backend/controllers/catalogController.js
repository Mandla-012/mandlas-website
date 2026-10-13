const Product = require('../models/Product');
const { CATEGORIES } = require('../config/constants');

exports.categories = async (req, res) => {
    try {
        const counts = await Product.aggregate([
            { $match: { quantity: { $gt: 0 } } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        const map = new Map(counts.map((c) => [c._id, c.count]));
        res.json({ success: true, categories: CATEGORIES.map((c) => ({ ...c, count: map.get(c.id) || 0 })) });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load categories.' });
    }
};

exports.brands = async (req, res) => {
    try {
        const groups = await Product.aggregate([
            { $match: { quantity: { $gt: 0 }, brandKey: { $ne: '' } } },
            { $group: { _id: '$brandKey', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 12 }
        ]);
        // Show each brand the way a seller typed it (e.g. "Lenovo" rather than "lenovo")
        const names = await Product.find({ brandKey: { $in: groups.map((g) => g._id) } }).select('brand brandKey');
        const nameOf = new Map();
        names.forEach((p) => { if (!nameOf.has(p.brandKey)) nameOf.set(p.brandKey, p.brand); });
        res.json({ success: true, brands: groups.map((g) => ({ name: nameOf.get(g._id) || g._id, count: g.count })) });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load brands.' });
    }
};
