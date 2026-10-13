const Message = require('../models/Message');
const Product = require('../models/Product');
const User = require('../models/User');
const { isId, str, publicName } = require('../utils/helpers');

exports.send = async (req, res) => {
    try {
        const b = req.body || {};
        const body = str(b.body, 1000);
        if (!isId(b.productId)) return res.status(400).json({ success: false, message: 'Invalid listing.' });
        if (!body) return res.status(400).json({ success: false, message: 'Write a message first.' });

        const product = await Product.findById(b.productId).select('owner');
        if (!product) return res.status(404).json({ success: false, message: 'That listing no longer exists.' });

        let to;
        if (product.owner.equals(req.userId)) {
            // The seller can only reply to someone who already wrote about this listing
            if (!isId(b.to)) return res.status(400).json({ success: false, message: 'Choose who to reply to.' });
            const talked = await Message.exists({ product: product._id, from: b.to, to: req.userId });
            if (!talked) return res.status(403).json({ success: false, message: 'You can only reply to people who messaged you.' });
            to = b.to;
        } else {
            to = product.owner;
        }

        const recipient = await User.findById(to);
        if (!recipient) return res.status(404).json({ success: false, message: 'That person no longer exists.' });
        if (recipient.privacy.allowMessages === false) {
            return res.status(403).json({ success: false, message: 'This person is not accepting messages right now.' });
        }
        await Message.create({ product: product._id, from: req.userId, to, body });
        res.status(201).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Could not send your message.' });
    }
};

exports.list = async (req, res) => {
    try {
        const msgs = await Message.find({ $or: [{ from: req.userId }, { to: req.userId }] })
            .sort({ createdAt: -1 })
            .limit(200)
            .populate('product', 'title')
            .populate('from', 'fullName privacy')
            .populate('to', 'fullName privacy');
        res.json({
            success: true,
            messages: msgs
                .filter((m) => m.from && m.to)
                .map((m) => ({
                    id: String(m._id),
                    product: m.product ? { id: String(m.product._id), title: m.product.title } : null,
                    from: { id: String(m.from._id), name: publicName(m.from, req.userId) },
                    to: { id: String(m.to._id), name: publicName(m.to, req.userId) },
                    body: m.body,
                    createdAt: m.createdAt
                }))
        });
    } catch {
        res.status(500).json({ success: false, message: 'Could not load your messages.' });
    }
};
