// Every API URL starts with /api. This file decides which router answers which part.
const router = require('express').Router();

router.use('/', require('./authRoutes'));          // /register /login /logout /me
router.use('/', require('./catalogRoutes'));       // /categories /brands
router.use('/products', require('./productRoutes'));
router.use('/', require('./storeRoutes'));         // /stores /store /store/delivery /store/orders
router.use('/messages', require('./messageRoutes'));
router.use('/favourites', require('./favouriteRoutes'));
router.use('/offers', require('./offerRoutes'));
router.use('/orders', require('./orderRoutes'));
router.use('/wallet', require('./walletRoutes'));
router.use('/security', require('./securityRoutes'));
router.use('/settings', require('./settingsRoutes'));
router.use('/', require('./miscRoutes'));          // /users/:id/avatar /notifications /admin/payouts

module.exports = router;
