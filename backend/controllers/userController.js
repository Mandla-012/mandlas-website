const Avatar = require('../models/Avatar');
const { isId } = require('../utils/helpers');

exports.avatar = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(404).end();
        const a = await Avatar.findOne({ user: req.params.id });
        if (!a) return res.status(404).end();
        res.set('Content-Type', a.contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // the page adds ?v=version so a new photo shows at once
        res.send(a.data);
    } catch {
        res.status(500).end();
    }
};
