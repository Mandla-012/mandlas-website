const Favourite = require('../models/Favourite');
const Product = require('../models/Product');
const { isId } = require('../utils/helpers');
const { mapProduct } = require('../utils/mappers');

exports.list = async (req, res) => {
    try {
        const favs = await Favourite.find({ user: req.userId })
            .sort({ createdAt: -1 })
            .limit(200)
            .populate({ path: 'product', select: '-images', populate: { path: 'store', select: 'name' } });
        // quantity 0 means the item is sold, so the page can show Available or Sold
        res.json({ success: true, products: favs.filter((f) => f.product).map((f) => mapProduct(f.product)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not load your favourites.' });
    }
};

exports.add = async (req, res) => {
    try {
        const productId = req.body && req.body.productId;
        if (!isId(productId)) return res.status(400).json({ success: false, message: 'Invalid listing.' });

        const product = await Product.findById(productId).select('owner');
        if (!product) return res.status(404).json({ success: false, message: 'That listing no longer exists.' });
        if (product.owner.equals(req.userId)) {
            return res.status(400).json({ success: false, message: "That's your own listing." });
        }
        if ((await Favourite.countDocuments({ user: req.userId })) >= 500) {
            return res.status(400).json({ success: false, message: 'Your favourites list is full.' });
        }

        try {
            await Favourite.create({ user: req.userId, product: product._id });
        } catch (e) {
            if (e.code !== 11000) throw e; // already a favourite, which is fine
        }
        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not save to favourites.' });
    }
};

exports.remove = async (req, res) => {
    try {
        if (!isId(req.params.productId)) return res.status(404).json({ success: false, message: 'Not found.' });
        await Favourite.deleteOne({ user: req.userId, product: req.params.productId });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Could not remove from favourites.' });
    }
};
