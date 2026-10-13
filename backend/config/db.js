// Connects to MongoDB and reports clearly when the connection drops or comes back.
// If the database is unreachable the server keeps running and the API answers
// "database not connected" until the connection returns (the driver retries by itself).
const mongoose = require('mongoose');
const { MONGO_URI } = require('./env');

let watching = false;
let wasConnected = false;
function watch() {
    if (watching) return;
    watching = true;
    mongoose.connection.on('disconnected', () => {
        if (!wasConnected) return; // a failed first attempt is reported below instead
        console.error('⚠️  Lost the connection to MongoDB. Retrying automatically...');
        console.error('   Usual causes: your IP changed (Atlas -> Network Access), Wi-Fi/VPN dropped, or the cluster is paused.');
    });
    mongoose.connection.on('reconnected', () => console.log('✅ Reconnected to MongoDB.'));
    mongoose.connection.on('error', (err) => console.error('⚠️  MongoDB error:', err.message));
}

async function connectDB() {
    watch();
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
        wasConnected = true;
        console.log('✅ Connected to MongoDB.');
    } catch (err) {
        console.error('❌ Database connection failure:', err.message);
        if (/ENOTFOUND|querySrv/i.test(err.message)) console.error('   "ENOTFOUND" means that address does not exist. Check the cluster name in MONGO_URI (copy it again from Atlas) and that the internet works.');
        if (/bad auth|Authentication failed/i.test(err.message)) console.error('   The database username or password in MONGO_URI is wrong.');
        console.error('   Check: backend/.env is filled in, Atlas Network Access allows your IP,');
        console.error('   the database user/password are right, and special characters are URL-encoded.');
    }
}

module.exports = connectDB;
