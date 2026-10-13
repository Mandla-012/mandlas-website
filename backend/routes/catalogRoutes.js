const router = require('express').Router();
const c = require('../controllers/catalogController');

router.get('/categories', c.categories);
router.get('/brands', c.brands);

module.exports = router;
