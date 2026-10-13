const router = require('express').Router();
const c = require('../controllers/walletController');
const { requireAuth } = require('../middlewares/auth');
const { strictLimiter, writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.use(requireAuth);
router.get('/', c.get);
router.post('/withdraw', strictLimiter, jsonSmall, c.withdraw);
router.patch('/auto-payout', strictLimiter, jsonSmall, c.autoPayout);
router.post('/payouts/:id/cancel', writeLimiter, c.cancelPayout);

module.exports = router;
