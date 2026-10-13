const mongoose = require('mongoose');

// A price negotiation between one buyer and the seller of one product.
const offerSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        listPriceCents: { type: Number, required: true },
        priceCents: { type: Number, required: true }, // the latest proposed price
        turn: { type: String, enum: ['buyer', 'seller'], required: true }, // who must answer next
        status: { type: String, enum: ['open', 'accepted', 'declined', 'expired', 'cancelled', 'used'], default: 'open' },
        source: { type: String, enum: ['buyer', 'seller_broadcast'], default: 'buyer' },
        rounds: { type: Number, default: 1 },
        history: [{ by: String, priceCents: Number, note: String, at: { type: Date, default: Date.now }, _id: false }],
        expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Offer', offerSchema);
