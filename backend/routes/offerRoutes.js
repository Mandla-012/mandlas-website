const router = require('express').Router();
const c = require('../controllers/offerController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.use(requireAuth);
router.get('/', c.list);
router.post('/', writeLimiter, jsonSmall, c.create);
router.post('/broadcast', writeLimiter, jsonSmall, c.broadcast);
router.get('/audience/:productId', c.audience);
router.post('/:id/respond', writeLimiter, jsonSmall, c.respond);
router.post('/:id/cancel', writeLimiter, c.cancel);

module.exports = router;
