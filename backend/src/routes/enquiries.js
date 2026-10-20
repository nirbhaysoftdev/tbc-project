// src/routes/enquiries.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin, requireActive } = require('../middleware/auth');
const ctrl = require('../controllers/enquiryController');

// Every route here needs a real, approved member. The member's identity comes
// from this middleware's verified token and nowhere else.
router.use(authenticate, requireActive);

// An IP-level limiter in front of the per-member throttles in the controller.
// This one is the cheap guard that stops a flood before it reaches the
// database; the controller's is the one that stops a single logged-in member
// sending twenty enquiries from twenty addresses.
const enquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enquiries from this connection. Please try again shortly.' },
});

router.post('/', enquiryLimiter, ctrl.createEnquiry);

// The record side. Admin-only: an enquiry holds another member's message and
// the internal recipient address.
router.get('/', requireAdmin, ctrl.listEnquiries);

// The portal-wide recipient. Above nothing else, but kept below '/' so the
// listing route is not shadowed.
router.get('/recipient', requireAdmin, ctrl.getRecipient);
// Redirects every future enquiry email, so it is an interception risk.
router.put('/recipient', requireSuperAdmin, ctrl.updateRecipient);

module.exports = router;
