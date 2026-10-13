const router = require('express').Router();
const c = require('../controllers/productController');
const { requireAuth } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiters');
const { jsonLarge } = require('../middlewares/bodyParsers');

router.get('/', c.list);
router.get('/:id', c.getOne);
router.get('/:id/thumb', c.getThumb);
router.get('/:id/images/:n', c.getImage);
router.post('/', requireAuth, writeLimiter, jsonLarge, c.create); // jsonLarge: accepts photos
router.delete('/:id', requireAuth, writeLimiter, c.remove);

module.exports = router;
