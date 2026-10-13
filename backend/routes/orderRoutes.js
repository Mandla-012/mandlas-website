const router = require('express').Router();
const c = require('../controllers/orderController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.post('/', requireAuth, writeLimiter, jsonSmall, c.create);
router.get('/', requireAuth, c.mine);
router.post('/:id/action', requireAuth, writeLimiter, jsonSmall, c.action);

module.exports = router;
