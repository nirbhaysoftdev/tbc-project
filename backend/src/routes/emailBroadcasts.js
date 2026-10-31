// src/routes/emailBroadcasts.js
//
// The admin "Email Communication" broadcast. Mounted on /api/admin alongside
// routes/admin.js and routes/adminEvents.js, so it sits next to /admin/logs
// without adding another file's worth of handlers to admin.js.
//
// requireAdmin, not requireSuperAdmin: both ADMIN and SUPER_ADMIN may write
// and send a broadcast - this is not a super-admin-only power the way issuing
// API keys or managing other admins is.
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/emailBroadcastController');

router.use(authenticate, requireAdmin);

router.get('/broadcasts/audience', ctrl.getAudience);
router.post('/broadcasts/preview', ctrl.preview);
router.post('/broadcasts', ctrl.createBroadcast);
router.get('/broadcasts', ctrl.listBroadcasts);
router.get('/broadcasts/:id', ctrl.getBroadcast);
router.post('/broadcasts/:id/retry', ctrl.retryBroadcast);

module.exports = router;
