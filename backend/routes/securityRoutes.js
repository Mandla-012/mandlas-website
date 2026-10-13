const router = require('express').Router();
const c = require('../controllers/securityController');
const { requireAuth } = require('../middlewares/auth');
const { strictLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.use(requireAuth);
router.get('/status', c.status);
router.post('/verify/password', strictLimiter, jsonSmall, c.verifyPassword);
router.post('/verify/passkey', strictLimiter, jsonSmall, c.verifyPasskey);
router.post('/passkey/register-options', strictLimiter, jsonSmall, c.registerOptions);
router.post('/passkey/register-verify', strictLimiter, jsonSmall, c.registerVerify);
router.delete('/passkey/:id', strictLimiter, c.removePasskey);

module.exports = router;
