// Turns database documents into the safe shapes the website receives.
const { ADMIN_EMAILS } = require('../config/env');
const { DEFAULT_DELIVERY } = require('../config/constants');

const avatarInfo = (u) => ({ has: (u.avatarVersion || 0) > 0, verified: !!u.avatarVerified, v: u.avatarVersion || 0 });

const publicUser = (u) => ({
    id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    avatar: avatarInfo(u),
    isAdmin: ADMIN_EMAILS.includes(String(u.email).toLowerCase())
});

const mapDelivery = (o) => ({
    id: String(o._id),
    type: o.type,
    label: o.label,
    price: (o.priceCents || 0) / 100,
    minDays: o.minDays,
    maxDays: o.maxDays,
    areas: o.areas || ''
});

// A store with no delivery options still offers collection
const storeDelivery = (store) =>
    store && store.deliveryOptions && store.deliveryOptions.length ? store.deliveryOptions.map(mapDelivery) : [DEFAULT_DELIVERY];

function mapProduct(p) {
    const storePopulated = p.store && p.store.name !== undefined;
    const ownerId = p.owner && p.owner._id ? p.owner._id : p.owner;
    return {
        id: String(p._id),
        title: p.title,
        description: p.description,
        price: p.price,
        category: p.category,
        brand: p.brand,
        condition: p.condition,
        quantity: p.quantity,
        imageCount: p.imageCount,
        owner: String(ownerId),
        store: { id: String(storePopulated ? p.store._id : p.store), name: storePopulated ? p.store.name : '' },
        createdAt: p.createdAt
    };
}

module.exports = { publicUser, mapProduct, mapDelivery, storeDelivery, avatarInfo };
