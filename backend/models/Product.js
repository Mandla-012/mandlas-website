const mongoose = require('mongoose');

// Photos live in their own collection (ProductImage) so product lists stay small and fast.
const productSchema = new mongoose.Schema(
    {
        store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 80 },
        description: { type: String, trim: true, maxlength: 1000, default: '' },
        price: { type: Number, required: true, min: 1, max: 1000000 },
        category: { type: String, required: true },
        brand: { type: String, trim: true, maxlength: 40, default: '' },
        brandKey: { type: String, default: '' }, // lowercase brand, used to group brands
        condition: { type: String, enum: ['new', 'like-new', 'good', 'fair'], default: 'good' },
        quantity: { type: Number, required: true, min: 0, default: 1 }, // 0 means sold out
        imageCount: { type: Number, default: 0 },
        lastBroadcastAt: Date // when the seller last sent an offer to people who saved this item
    },
    { timestamps: true }
);

productSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
