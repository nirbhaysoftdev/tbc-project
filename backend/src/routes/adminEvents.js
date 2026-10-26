// src/routes/adminEvents.js
//
// The admin event feed. Mounted on /api/admin alongside routes/admin.js, the
// way routes/investments.js already is, so it sits next to /admin/logs without
// adding another file's worth of handlers to admin.js.
//
// TWO KINDS OF CALLER, one gate. `machineOrAdmin(scope)` serves a logged-in
// ADMIN session exactly as before, and a machine presenting an API key with
// the required scope. See middleware/apiKey.js.
//
// ADMIN, not SUPER_ADMIN, for the human path: this is the screen an admin uses
// to see that there is an application to review, a withdrawal to decide and an
// enquiry that did not go out. Acting on any of those is still gated where it
// was - approving a member is requireAdmin, deciding a withdrawal is
// requireSuperAdmin - and nothing in here changes anything.
//
// Not member-reachable at any level: every event carries another person's
// contact details, identity-document paths, bank details or private message.
// A key without `events:sensitive` gets those fields stripped; a member gets
// nothing at all.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const { machineOrAdmin } = require('../middleware/apiKey');
const ctrl = require('../controllers/eventFeedController');

// Per-key, not per-IP. A machine integration is one key behind one address,
// and several consumers behind a corporate NAT would otherwise share a budget.
// Admin sessions fall back to the IP and are covered by the global limiter
// anyway.
const feedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,                      // two polls a second, sustained
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.apiKey ? `key:${req.apiKey.id}` : `ip:${req.ip}`),
  message: { error: 'Too many requests. The feed allows 120 per minute per key.' },
});

// '/events/counts' first: '/events' is an exact path here so it would not
// actually shadow it, but keeping the specific route above the general one is
// the habit that stops the next addition ('/events/:id') from breaking it.
//
// Reading the counts is satisfied by the narrow scope or the broad one - a key
// that may read the feed may certainly count it.
router.get(
  '/events/counts',
  machineOrAdmin(['events:counts', 'events:read']),
  feedLimiter,
  ctrl.countEvents,
);
router.get(
  '/events',
  machineOrAdmin('events:read'),
  feedLimiter,
  ctrl.listEvents,
);

module.exports = router;
