// Shared lists, limits and patterns. Add or rename technology types here.
const CATEGORIES = [
    { id: 'laptops', name: 'Laptops', icon: 'fa-laptop' },
    { id: 'phones', name: 'Cellphones', icon: 'fa-mobile-screen' },
    { id: 'tablets', name: 'Tablets', icon: 'fa-tablet-screen-button' },
    { id: 'peripherals', name: 'Mice & Keyboards', icon: 'fa-computer-mouse' },
    { id: 'wearables', name: 'Smartwatches', icon: 'fa-clock' },
    { id: 'audio', name: 'Headphones & Audio', icon: 'fa-headphones' },
    { id: 'gaming', name: 'Gaming', icon: 'fa-gamepad' },
    { id: 'cameras', name: 'Cameras', icon: 'fa-camera' },
    { id: 'screens', name: 'TVs & Monitors', icon: 'fa-tv' },
    { id: 'components', name: 'Computer Parts', icon: 'fa-microchip' },
    { id: 'storage', name: 'Storage & Drives', icon: 'fa-hard-drive' },
    { id: 'networking', name: 'Networking', icon: 'fa-wifi' },
    { id: 'accessories', name: 'Accessories', icon: 'fa-plug' },
    { id: 'other', name: 'Other Tech', icon: 'fa-bolt' }
];

module.exports = {
    CATEGORIES,
    CATEGORY_IDS: CATEGORIES.map((c) => c.id),
    CONDITIONS: ['new', 'like-new', 'good', 'fair'],
    EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    ID_RE: /^[a-f\d]{24}$/i,
    DAY_MS: 24 * 60 * 60 * 1000,

    // Delivery
    DELIVERY_TYPES: ['collection', 'courier', 'local', 'locker'],
    MAX_DELIVERY_OPTIONS: 6,
    DEFAULT_DELIVERY: { id: 'default-collection', type: 'collection', label: 'Collect from seller', price: 0, minDays: 0, maxDays: 0, areas: 'Arrange a time with the seller' },
    PROVINCES: ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],

    // Orders and money (all money in the database is stored in cents)
    PLATFORM_FEE_PERCENT: 0, // set e.g. 5 to keep 5% of every sale
    AUTO_COMPLETE_DAYS: 7, // delivered orders complete by themselves after this long
    MIN_PAYOUT_CENTS: 5000, // R50
    BANKS: ['Absa', 'African Bank', 'Bank Zero', 'Capitec Bank', 'Discovery Bank', 'FNB', 'Investec', 'Nedbank', 'Standard Bank', 'TymeBank'],
    ACCOUNT_TYPES: ['cheque', 'savings', 'transmission'],

    // Offers
    OFFER_MIN_PERCENT: 50, // an offer can't go below half the asking price
    OFFER_OPEN_HOURS: 72,
    OFFER_LOCK_HOURS: 48, // how long an accepted offer price is reserved for the buyer
    OFFER_MAX_ROUNDS: 6,

    // Security
    STEP_UP_MINUTES: 3,
    PASSWORD_WINDOW_MINUTES: 2,
    MAX_PASSKEYS: 5
};
