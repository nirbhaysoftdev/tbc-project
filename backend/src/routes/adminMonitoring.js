// src/routes/adminMonitoring.js
//
// Analytics & Monitoring. Mounted on /api/admin at /monitoring, for ADMIN and
// SUPER_ADMIN, and READ-ONLY: only GET is routed, and the guard below answers
// every other method with 405 before any handler is considered, so a future
// careless `router.post` has to be added on purpose and past a visible check.
//
// Not reachable with an API key (it carries member names, emails and IPs) and
// closed while impersonating, because requireAdmin refuses an impersonated
// session.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/trafficMonitorController');

router.use('/monitoring', authenticate, requireAdmin);
router.use('/monitoring', (req, res, next) => {
  if (req.method === 'GET') return next();
  res.set('Allow', 'GET');
  return res.status(405).json({ error: 'Analytics is read-only.' });
});
// Aggregates over the whole history are the expensive endpoints here.
router.use('/monitoring', rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Too many requests, slow down.' } }));

router.get('/monitoring/overview',   ctrl.getOverview);
router.get('/monitoring/live',       ctrl.getLive);
router.get('/monitoring/live/stream', ctrl.streamLive);
router.get('/monitoring/sessions',   ctrl.getSessions);
router.get('/monitoring/landing',    ctrl.getLanding);
router.get('/monitoring/geo',        ctrl.getGeo);
router.get('/monitoring/auth',       ctrl.getAuth);
router.get('/monitoring/traffic',    ctrl.getTraffic);
router.get('/monitoring/options',    ctrl.getOptions);
router.get('/monitoring/users',      ctrl.getUsers);
router.get('/monitoring/users/:id',  ctrl.getUserHistory);
router.get('/monitoring/export',     ctrl.exportCsv);

module.exports = router;
