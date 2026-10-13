const router = require('express').Router();
const c = require('../controllers/settingsController');
const { requireAuth } = require('../middlewares/auth');
const { strictLimiter } = require('../middlewares/rateLimiters');
const { jsonSmall } = require('../middlewares/bodyParsers');
const express = require('express');

const jsonAvatar = express.json({ limit: '300kb' });

router.use(requireAuth);
router.get('/', c.get);
router.patch('/profile', strictLimiter, jsonSmall, c.profile);
router.patch('/contact', strictLimiter, jsonSmall, c.contact);
router.put('/bank', strictLimiter, jsonSmall, c.bank);
router.patch('/notifications', strictLimiter, jsonSmall, c.notifications);
router.patch('/privacy', strictLimiter, jsonSmall, c.privacy);
router.put('/avatar', strictLimiter, jsonAvatar, c.avatar);
router.put('/password', strictLimiter, jsonSmall, c.password);

module.exports = router;
