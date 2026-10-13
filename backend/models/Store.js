const mongoose = require('mongoose');
const { DELIVERY_TYPES } = require('../config/constants');

const deliverySchema = new mongoose.Schema({
    type: { type: String, enum: DELIVERY_TYPES, required: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    priceCents: { type: Number, required: true, min: 0, max: 500000 },
    minDays: { type: Number, required: true, min: 0, max: 30 },
    maxDays: { type: Number, required: true, min: 0, max: 30 },
    areas: { type: String, trim: true, maxlength: 120, default: '' }
});

const storeSchema = new mongoose.Schema(
    {
        // unique: true means one store per user
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        name: { type: String, required: true, trim: true, maxlength: 40 },
        nameKey: { type: String, required: true, unique: true },
        description: { type: String, trim: true, maxlength: 300, default: '' },
        deliveryOptions: { type: [deliverySchema], default: [] }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Store', storeSchema);
