// One-time upgrades for data created by older versions. Safe to run on every start.
const Product = require('../models/Product');
const ProductImage = require('../models/ProductImage');

async function migrate() {
    try {
        // 1) Photos used to be stored inside each product. Move them to their own collection.
        const col = Product.collection;
        const old = await col.find({ images: { $exists: true } }).limit(200).toArray();
        for (const doc of old) {
            const imgs = Array.isArray(doc.images) ? doc.images : [];
            for (let i = 0; i < imgs.length; i++) {
                const raw = imgs[i].data;
                const data = Buffer.from(raw && raw.buffer ? raw.buffer : raw);
                try {
                    await ProductImage.create({ product: doc._id, idx: i, kind: 'full', contentType: imgs[i].contentType, data });
                } catch (e) {
                    if (e.code !== 11000) throw e;
                }
            }
            await col.updateOne({ _id: doc._id }, { $unset: { images: 1 }, $set: { imageCount: imgs.length } });
        }
        if (old.length) console.log(`✅ Moved photos of ${old.length} older listing(s) to the new photo collection.`);

        // 2) Brand keys (lowercase brand) so brands group correctly
        const noKey = await Product.find({ brandKey: { $exists: false } }).limit(500);
        for (const p of noKey) await Product.updateOne({ _id: p._id }, { $set: { brandKey: (p.brand || '').toLowerCase() } });
    } catch (e) {
        console.error('Migration warning:', e.message);
    }
}

module.exports = migrate;
