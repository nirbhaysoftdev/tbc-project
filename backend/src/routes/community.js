// src/routes/community.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/communityController');

// All community routes require auth
router.use(authenticate);

// ── Stats ─────────────────────────────────────
router.get('/stats', ctrl.getCommunityStats);

// ── Feed ──────────────────────────────────────
router.get('/feed',       ctrl.getFeed);
router.post('/feed',      ctrl.createPost);
router.delete('/feed/:id', ctrl.deletePost);
router.post('/feed/:id/like',     ctrl.toggleLike);
router.get('/feed/:id/comments',  ctrl.getComments);
router.post('/feed/:id/comments', ctrl.addComment);

// ── Members / Directory ───────────────────────
router.get('/members',     ctrl.getMembers);
router.get('/members/:id', ctrl.getMemberProfile);

// ── Own profile ───────────────────────────────
router.put('/profile', ctrl.updateProfile);

// ── Notifications ─────────────────────────────
router.get('/notifications',            ctrl.getNotifications);
router.put('/notifications/:id/read',   ctrl.markNotificationRead);

module.exports = router;
