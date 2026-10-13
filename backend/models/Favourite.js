const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }
    },
    { timestamps: true }
);

// A person can favourite a given product only once
favouriteSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('Favourite', favouriteSchema);
