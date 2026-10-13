const express = require('express');

// Small bodies by default, large only on the route that accepts photos
module.exports = {
    jsonSmall: express.json({ limit: '10kb' }),
    jsonLarge: express.json({ limit: '3mb' })
};
