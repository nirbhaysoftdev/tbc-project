// src/routes/adminAnalytics.js
//
// The admin Overview's numbers. Mounted on /api/admin beside routes/admin.js,
// like routes/adminEvents.js and routes/investments.js.
//
// ADMIN, not SUPER_ADMIN: this is the panel's own front page. It is read-only
// and aggregate - no member is named in any figure it returns - which is why it
// does not need the stricter gate the key management does.
//
// Deliberately NOT reachable with an API key. The event feed is the machine
// surface (routes/adminEvents.js); widening this one would mean another
// redaction boundary to keep correct for no asked-for benefit.
const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminAnalyticsController');

router.use(authenticate, requireAdmin);

router.get('/analytics', ctrl.getOverview);

module.exports = router;
