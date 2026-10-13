// Builds the Express app: security, static website files, then the API.
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { FRONTEND_DIR, IS_PROD } = require('./config/env');
const securityHeaders = require('./middlewares/security');
const dbReady = require('./middlewares/dbReady');
const { notFoundApi, errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

const app = express();

// Behind a proxy or tunnel (Render, Cloudflare, ngrok, VS Code port forwarding)? Set TRUST_PROXY=1 in .env.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use(securityHeaders);
app.use(compression()); // smaller downloads = faster on phones
app.use(cookieParser());

// Only the frontend folder is served, so backend files and .env are never exposed
app.use(
    express.static(FRONTEND_DIR, {
        maxAge: IS_PROD ? '1d' : 0,
        // fonts and icons never change, so the phone keeps them for a year
        setHeaders(res, filePath) {
            if (/[\\/]vendor[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    })
);

app.use('/api', dbReady);
app.use('/api', routes);
app.use('/api', notFoundApi);
app.use(errorHandler);

module.exports = app;
