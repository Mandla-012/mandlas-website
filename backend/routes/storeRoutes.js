const router = require('express').Router();
const c = require('../controllers/storeController');
const delivery = require('../controllers/deliveryController');
const orders = require('../controllers/orderController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.get('/stores', c.list);
router.get('/stores/:id', c.getOne);
router.get('/store/me', requireAuth, c.mine);
router.post('/store', requireAuth, writeLimiter, jsonSmall, c.create);

// Delivery options and the order tracker of my own store
router.get('/store/delivery', requireAuth, delivery.mine);
router.post('/store/delivery', requireAuth, writeLimiter, jsonSmall, delivery.add);
router.delete('/store/delivery/:id', requireAuth, writeLimiter, delivery.remove);
router.get('/store/orders', requireAuth, orders.forStore);

module.exports = router;
