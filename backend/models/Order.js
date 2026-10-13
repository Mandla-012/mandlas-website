const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
    { fullName: String, phone: String, street: String, city: String, province: String, postalCode: String },
    { _id: false }
);

// One order per store. A checkout with items from 3 stores creates 3 orders (same checkoutId).
const orderSchema = new mongoose.Schema(
    {
        checkoutId: { type: String, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the buyer
        seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', index: true },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
                name: { type: String, required: true },
                price: { type: Number, required: true }, // price paid per item, in rands
                listPrice: { type: Number },
                qty: { type: Number, required: true, min: 1 },
                offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
                _id: false
            }
        ],
        subtotalCents: Number,
        deliveryCents: { type: Number, default: 0 },
        feeCents: { type: Number, default: 0 },
        totalCents: Number, // what the buyer paid
        netCents: Number, // what the seller receives
        total: Number, // total in rands (kept for older screens)
        // note: a field called "type" must be written as { type: String } inside a nested object
        delivery: { optionId: String, type: { type: String }, label: String, priceCents: Number, minDays: Number, maxDays: Number },
        address: addressSchema,
        payment: { method: String, status: String },
        status: {
            type: String,
            enum: ['placed', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled', 'pending', 'paid'],
            default: 'placed'
        },
        history: [{ status: String, by: String, note: String, at: Date, _id: false }],
        deliveredAt: Date,
        completedAt: Date,
        cancelledAt: Date
    },
    { timestamps: true }
);

orderSchema.index({ store: 1, status: 1 });

module.exports = mongoose.model('Order', orderSchema);
