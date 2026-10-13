// Loads backend/.env once and exposes the settings the rest of the app needs.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const missing = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missing.length) {
    console.error(`❌ Missing ${missing.join(' and ')} in backend/.env`);
    console.error('   Copy .env.example to .env and fill it in.');
    process.exit(1);
}

const IS_PROD = process.env.NODE_ENV === 'production';

// The .env.example file contains example values. Stop with a clear message if they were never replaced.
if (/USER:PASSWORD|xxxxx|<password>|<username>/i.test(process.env.MONGO_URI)) {
    console.error('❌ backend/.env still has the EXAMPLE MongoDB address (it contains "xxxxx" or "USER:PASSWORD").');
    console.error('   Replace MONGO_URI with your real connection string:');
    console.error('   1. Atlas -> Database -> Connect -> Drivers -> copy the connection string');
    console.error('   2. Put your database user\'s password where it says <password>');
    console.error('   3. Add the database name after ".net/" (the name that holds your accounts), e.g. ...mongodb.net/shop?retryWrites=...');
    console.error('   Or copy the MONGO_URI line from the .env of your old project.');
    process.exit(1);
}
const exampleSecret = (v) => /^replace_with/i.test(v || '');
if (exampleSecret(process.env.JWT_SECRET) || exampleSecret(process.env.DATA_ENCRYPTION_KEY)) {
    const msg = 'JWT_SECRET / DATA_ENCRYPTION_KEY still have the example text. Anyone can read that, so replace them with your own long random values.\n   Make one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';
    if (IS_PROD) { console.error('❌ ' + msg); process.exit(1); }
    console.warn('⚠️  ' + msg);
}
const list = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

module.exports = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    IS_PROD,
    // The website files live in ../frontend, next to the backend folder
    FRONTEND_DIR: path.join(__dirname, '..', '..', 'frontend'),

    // Encrypts bank account numbers in the database. Set your own long random value.
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || '',

    // Face ID (WebAuthn). Only set these when you serve the site from a fixed https address.
    WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN || '',
    WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID || '',

    // DEVELOPMENT ONLY: skips the Face ID step so you can test on http://192.168.x.x. Ignored in production.
    DEV_SKIP_FACE_ID: process.env.DEV_SKIP_FACE_ID === 'true' && !IS_PROD,

    // Emails allowed to process payouts at #/admin (comma separated)
    ADMIN_EMAILS: list(process.env.ADMIN_EMAILS),

    // Hours after a bank account change before money can be withdrawn (anti-fraud)
    BANK_COOLDOWN_HOURS: Number.isFinite(Number(process.env.BANK_COOLDOWN_HOURS)) && process.env.BANK_COOLDOWN_HOURS !== undefined && process.env.BANK_COOLDOWN_HOURS !== ''
        ? Number(process.env.BANK_COOLDOWN_HOURS) : 24
};
