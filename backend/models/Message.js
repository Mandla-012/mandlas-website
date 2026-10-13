const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        body: { type: String, required: true, trim: true, maxlength: 1000 }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
