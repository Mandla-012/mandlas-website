const router = require('express').Router();
const c = require('../controllers/messageController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.post('/', requireAuth, writeLimiter, jsonSmall, c.send);
router.get('/', requireAuth, c.list);

module.exports = router;
