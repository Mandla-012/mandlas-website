// Shows which database this server uses and whether an account exists.
// Usage (from the backend folder):   node tools/check-user.js you@example.com
//                                    node tools/check-user.js            (lists registered emails)
require('../config/env');
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
    const email = (process.argv[2] || '').trim().toLowerCase();
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    } catch (e) {
        console.error('❌ Could not connect to the database:', e.message);
        process.exit(1);
    }
    const total = await User.countDocuments();
    console.log(`Database name: "${mongoose.connection.name}"   Accounts in it: ${total}`);

    if (!email) {
        const users = await User.find().sort({ createdAt: -1 }).limit(30).select('email fullName createdAt');
        if (!users.length) console.log('No accounts yet. Register one on the website.');
        users.forEach((u) => console.log(` - ${u.email}  (${u.fullName})`));
    } else {
        const u = await User.findOne({ email });
        if (!u) {
            console.log(`❌ No account with the email "${email}" in this database.`);
            console.log('   Either the email is spelled differently, or your accounts live in another database');
            console.log('   (check the name between ".net/" and "?" in MONGO_URI). Run this tool with no email to list the accounts here.');
        } else {
            console.log(`✅ Account found: ${u.fullName} <${u.email}>, created ${u.createdAt.toISOString().slice(0, 10)}`);
            console.log(u.lockedUntil && u.lockedUntil > new Date() ? `⚠️  Identity checks are locked until ${u.lockedUntil.toLocaleString()}` : '   The account exists, so the password must be different. Use tools/reset-password.js to set a new one.');
        }
    }
    await mongoose.disconnect();
})();
