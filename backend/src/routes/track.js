// src/routes/track.js
//
// POST /api/track - the one public write of the analytics module. It accepts a
// page beat from any browser, signed in or not, and answers 204 whatever
// happened: a tracker must never show an error to a visitor, and must not tell
// a scraper which of its guesses were accepted.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const tracker = require('../services/trafficTracker');

// Per address, and generous enough for a household behind one NAT: a visible
// tab sends two beats a minute plus a page view per navigation.
router.use(rateLimit({ windowMs: 60 * 1000, max: 90, standardHeaders: false, legacyHeaders: false, handler: (_req, res) => res.status(204).end() }));

// text/plain is accepted as well as JSON because navigator.sendBeacon (the only
// thing that survives a closing tab) sends a Blob whose type we choose, and a
// plain-text beacon avoids a CORS preflight that sendBeacon cannot perform.
router.post('/', express.text({ type: 'text/plain', limit: '4kb' }), (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  tracker.recordBeat(req, body && typeof body === 'object' ? body : {});
  res.status(204).end();
});

module.exports = router;
