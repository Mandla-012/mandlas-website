// Small routes: profile pictures, red-dot counters and the payout desk.
const router = require('express').Router();
const user = require('../controllers/userController');
const notes = require('../controllers/notificationController');
const admin = require('../controllers/adminController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');

router.get('/users/:id/avatar', user.avatar);
router.get('/notifications', requireAuth, notes.summary);

router.get('/admin/payouts', requireAuth, admin.requireAdmin, admin.listPayouts);
router.post('/admin/payouts/:id/paid', requireAuth, admin.requireAdmin, writeLimiter, jsonSmall, admin.markPaid);
router.post('/admin/payouts/:id/reject', requireAuth, admin.requireAdmin, writeLimiter, jsonSmall, admin.reject);

module.exports = router;
