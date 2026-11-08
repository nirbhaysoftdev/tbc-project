// src/routes/push.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/pushController');

router.use(authenticate);
router.get('/key',          ctrl.getPublicKey);
router.post('/subscribe',   ctrl.subscribe);
router.post('/unsubscribe', ctrl.unsubscribe);

module.exports = router;
