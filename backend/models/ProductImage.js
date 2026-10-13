const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    idx: { type: Number, required: true }, // 0 to 3
    kind: { type: String, enum: ['full', 'thumb'], required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true }
});

imageSchema.index({ product: 1, kind: 1, idx: 1 }, { unique: true });

module.exports = mongoose.model('ProductImage', imageSchema);
