// Security headers, including a strict Content-Security-Policy.
const helmet = require('helmet');

module.exports = helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            upgradeInsecureRequests: null // keeps http://localhost working in development
        }
    }
});
