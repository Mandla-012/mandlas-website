const Product = require('../models/Product');
const Store = require('../models/Store');
const Favourite = require('../models/Favourite');
const ProductImage = require('../models/ProductImage');
const Offer = require('../models/Offer');
const { CATEGORY_IDS, CONDITIONS } = require('../config/constants');
const { isId, str, escapeRegex, publicName } = require('../utils/helpers');
const { mapProduct, storeDelivery, avatarInfo } = require('../utils/mappers');
const { parseImage } = require('../utils/images');

exports.list = async (req, res) => {
    try {
        const q = {};
        const { category, brand, search, store } = req.query;
        if (typeof category === 'string' && CATEGORY_IDS.includes(category)) q.category = category;
        if (typeof brand === 'string' && brand.trim()) q.brand = new RegExp('^' + escapeRegex(brand.trim().slice(0, 40)) + '$', 'i');
        if (isId(store)) q.store = store; // a store page also shows its sold items
        else q.quantity = { $gt: 0 };
        if (typeof search === 'string' && search.trim()) {
            const rx = new RegExp(escapeRegex(search.trim().slice(0, 50)), 'i');
            q.$or = [{ title: rx }, { description: rx }, { brand: rx }];
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 24));

        const [items, total] = await Promise.all([
            Product.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('store', 'name'),
            Product.countDocuments(q)
        ]);
        res.json({ success: true, products: items.map(mapProduct), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load products.' });
    }
};

exports.getOne = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const p = await Product.findById(req.params.id)
            .populate('store', 'name deliveryOptions')
            .populate('owner', 'fullName privacy avatarVersion avatarVerified');
        if (!p) return res.status(404).json({ success: false, message: 'Not found.' });
        res.json({
            success: true,
            product: mapProduct(p),
            delivery: storeDelivery(p.store),
            seller: { id: String(p.owner._id), name: publicName(p.owner, req.userId), avatar: avatarInfo(p.owner) }
        });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load this listing.' });
    }
};

const sendImage = (res, img) => {
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=604800');
    res.send(img.data);
};

exports.getImage = async (req, res) => {
    try {
        const n = parseInt(req.params.n, 10);
        if (!isId(req.params.id) || !Number.isInteger(n) || n < 0 || n > 3) return res.status(404).end();
        const img = await ProductImage.findOne({ product: req.params.id, kind: 'full', idx: n });
        if (!img) return res.status(404).end();
        sendImage(res, img);
    } catch {
        res.status(500).end();
    }
};

// A small version for the product grid (phones download far less). Older listings fall back to the full photo.
exports.getThumb = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).end();
        const img =
            (await ProductImage.findOne({ product: req.params.id, kind: 'thumb', idx: 0 })) ||
            (await ProductImage.findOne({ product: req.params.id, kind: 'full', idx: 0 }));
        if (!img) return res.status(404).end();
        sendImage(res, img);
    } catch {
        res.status(500).end();
    }
};

exports.create = async (req, res) => {
    try {
        const store = await Store.findOne({ owner: req.userId });
        if (!store) return res.status(400).json({ success: false, message: 'Create your store first.' });

        const b = req.body || {};
        const title = str(b.title, 80);
        const description = str(b.description, 1000);
        const brand = str(b.brand, 40);
        const price = Math.round(Number(b.price) * 100) / 100;
        const quantity = Number(b.quantity);

        if (title.length < 3) return res.status(400).json({ success: false, message: 'Title must be at least 3 characters.' });
        if (!Number.isFinite(price) || price < 1 || price > 1000000) {
            return res.status(400).json({ success: false, message: 'Enter a price between R1 and R1 000 000.' });
        }
        if (typeof b.category !== 'string' || !CATEGORY_IDS.includes(b.category)) {
            return res.status(400).json({ success: false, message: 'Choose a category.' });
        }
        if (typeof b.condition !== 'string' || !CONDITIONS.includes(b.condition)) {
            return res.status(400).json({ success: false, message: 'Choose a condition.' });
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 99.' });
        }
        if (!Array.isArray(b.images) || b.images.length < 1 || b.images.length > 4) {
            return res.status(400).json({ success: false, message: 'Add 1 to 4 photos.' });
        }
        const images = b.images.map((i) => parseImage(i));
        if (images.some((i) => !i)) {
            return res.status(400).json({ success: false, message: 'One of the photos is invalid or too large. Use JPG, PNG or WebP.' });
        }
        const thumb = b.thumb ? parseImage(b.thumb, 80 * 1024) : null;
        if (b.thumb && !thumb) return res.status(400).json({ success: false, message: 'The preview picture is invalid.' });

        const p = await Product.create({
            store: store._id,
            owner: req.userId,
            title,
            description,
            price,
            category: b.category,
            brand,
            brandKey: brand.toLowerCase(),
            condition: b.condition,
            quantity,
            imageCount: images.length
        });
        try {
            await ProductImage.insertMany([
                ...images.map((im, idx) => ({ product: p._id, idx, kind: 'full', contentType: im.contentType, data: im.data })),
                ...(thumb ? [{ product: p._id, idx: 0, kind: 'thumb', contentType: thumb.contentType, data: thumb.data }] : [])
            ]);
        } catch (e) {
            await Product.deleteOne({ _id: p._id });
            throw e;
        }
        res.status(201).json({ success: true, id: String(p._id) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not publish your listing.' });
    }
};

exports.remove = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
        const result = await Product.deleteOne({ _id: req.params.id, owner: req.userId });
        if (!result.deletedCount) return res.status(404).json({ success: false, message: 'Listing not found.' });
        await Promise.all([
            Favourite.deleteMany({ product: req.params.id }),
            ProductImage.deleteMany({ product: req.params.id }),
            Offer.updateMany({ product: req.params.id, status: { $in: ['open', 'accepted'] } }, { $set: { status: 'cancelled' } })
        ]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not delete the listing.' });
    }
};
