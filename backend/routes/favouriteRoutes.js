const router = require('express').Router();
const c = require('../controllers/favouriteController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.get('/', requireAuth, c.list);
router.post('/', requireAuth, writeLimiter, jsonSmall, c.add);
router.delete('/:productId', requireAuth, writeLimiter, c.remove);

module.exports = router;
