// Server entry point: connect the database, then start listening.
const fs = require('fs');
const path = require('path');
const { PORT, FRONTEND_DIR } = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const migrate = require('./utils/migrations');
const mongoose = require('mongoose');

if (!fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    console.warn(`⚠️  Could not find ${path.join(FRONTEND_DIR, 'index.html')}`);
    console.warn('   The website will show "Cannot GET /". Put index.html in the frontend folder.');
}

connectDB().then(() => {
    if (mongoose.connection.readyState === 1) migrate();
});

const server = app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use by another program.`);
        console.error('   Close the other server (Windows: taskkill /IM node.exe /F) or set PORT=5001 in backend/.env');
        process.exit(1);
    }
    throw err;
});
