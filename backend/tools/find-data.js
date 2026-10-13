// Looks through EVERY database on your MongoDB cluster and shows where your users, stores and listings are.
// Usage (from the backend folder):   node tools/find-data.js
require('../config/env');
const mongoose = require('mongoose');

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    } catch (e) {
        console.error('❌ Could not connect to the database:', e.message);
        process.exit(1);
    }
    const client = mongoose.connection.getClient();
    const current = mongoose.connection.name;
    console.log(`This server currently uses the database: "${current}"\n`);

    let names;
    try {
        const r = await client.db().admin().listDatabases({ nameOnly: true });
        names = r.databases.map((d) => d.name).filter((n) => !['admin', 'local', 'config'].includes(n));
    } catch (e) {
        console.log('Your database user is not allowed to list databases, so only the current one is checked.');
        console.log('You can still look in Atlas: Database -> Browse Collections.\n');
        names = [current];
    }

    const found = [];
    for (const name of names) {
        const db = client.db(name);
        const count = async (c) => { try { return await db.collection(c).countDocuments({}); } catch { return 0; } };
        const [users, stores, products, orders] = await Promise.all([count('users'), count('stores'), count('products'), count('orders')]);
        if (users + stores + products + orders === 0) continue;
        found.push({ name, users, stores, products });
        console.log(`${name === current ? '👉' : '  '} ${name.padEnd(24)} users: ${String(users).padEnd(4)} stores: ${String(stores).padEnd(4)} listings: ${String(products).padEnd(4)} orders: ${orders}${name === current ? '   <- used by this server' : ''}`);
    }
    if (!found.length) console.log('No users, stores or listings were found in any database on this cluster.\nIf you used a different cluster before, check the MONGO_URI saved in your old project folder.');
    else {
        const best = [...found].sort((a, b) => b.users - a.users)[0];
        if (best.name !== current && best.users > 0) {
            console.log(`\nThe database with the most accounts is "${best.name}" (${best.users}), but this server uses "${current}".`);
            console.log('If the accounts and stores listed above for a database look like yours, point the server at it.');
            console.log(`Fix: in backend/.env change the name in MONGO_URI (the part between ".net/" and "?"), for example to "${best.name}":`);
            console.log(`   ...mongodb.net/${best.name}?retryWrites=true&w=majority`);
            console.log('Then restart the server.');
        } else if (best.name === current) console.log('\nYour accounts are in the database this server uses. If you still cannot log in, use tools/reset-password.js.');
    }
    await mongoose.disconnect();
})();
