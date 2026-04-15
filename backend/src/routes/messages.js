// src/routes/messages.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/messagesController');

router.use(authenticate);

router.get('/unread',             ctrl.getUnreadCount);
router.get('/',                   ctrl.getConversations);
router.get('/:partnerId',         ctrl.getMessages);
router.post('/',                  ctrl.sendMessage);

module.exports = router;
