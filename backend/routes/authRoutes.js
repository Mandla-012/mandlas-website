const router = require('express').Router();
const c = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.post('/register', authLimiter, jsonSmall, c.register);
router.post('/login', authLimiter, jsonSmall, c.login);
router.post('/logout', c.logout);
router.get('/me', requireAuth, c.me);

module.exports = router;
