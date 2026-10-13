// Sets a new password for an account. Run it on your own computer, where your .env lives.
// Usage (from the backend folder):   node tools/reset-password.js you@example.com NewPassword123
// Tip: after logging in, change it again in Settings so it does not stay in your terminal history.
require('../config/env');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
    const email = (process.argv[2] || '').trim().toLowerCase();
    const password = process.argv[3] || '';
    if (!email || !password) {
        console.log('Usage: node tools/reset-password.js you@example.com NewPassword123');
        process.exit(1);
    }
    if (password.length < 8 || password.length > 72) {
        console.log('❌ The password must be 8 to 72 characters.');
        process.exit(1);
    }
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    } catch (e) {
        console.error('❌ Could not connect to the database:', e.message);
        process.exit(1);
    }
    const hash = await bcrypt.hash(password, 12);
    const r = await User.updateOne({ email }, { $set: { password: hash, failedPw: 0 }, $unset: { lockedUntil: 1 } });
    if (!r.matchedCount) console.log(`❌ No account with the email "${email}" in database "${mongoose.connection.name}". Run node tools/check-user.js to list accounts.`);
    else console.log(`✅ Password changed for ${email}. You can log in now.`);
    await mongoose.disconnect();
})();
