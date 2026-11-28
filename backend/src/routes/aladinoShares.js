// src/routes/aladinoShares.js
//
// /api/aladino-shares - the standalone Aladino Shares page. Public routes need
// no login; /admin/* needs the page's own token (services/aladinoShares.js),
// which is not a portal session and is refused everywhere else.
const express = require('express');
const rateLimit = require('express-rate-limit');
const svc = require('../services/aladinoShares');

const router = express.Router();

// Per visitor, not per proxy: the API has no `trust proxy`, so behind nginx
// every request's socket address is 127.0.0.1 and one shared bucket would let
// a few visitors lock everyone else out. nginx sets X-Real-IP.
const visitor = (req) => req.headers['x-real-ip'] || req.ip;

const limit = (max, error) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: false, legacyHeaders: false, message: { error },
  keyGenerator: visitor,
});

const wrap = (fn) => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    if (e instanceof svc.ShareError) return res.status(e.status).json({ error: e.message, ...(e.extra || {}) });
    console.error('[aladino-shares]', e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── Public ────────────────────────────────────
router.get('/state', wrap(async (req, res) => {
  const s = await svc.publicState();
  res.json(s.visible ? s : { visible: false });
}));

router.post('/book', limit(20, 'Too many requests. Please wait a minute.'),
  wrap(async (req, res) => res.status(201).json(await svc.book(req.body || {}))));

// Looked up by email, so limited hard: it must not become a way to guess
// which addresses have booked.
router.post('/my-bookings', limit(10, 'Too many lookups. Please wait a minute.'),
  wrap(async (req, res) => res.json(await svc.myBookings((req.body || {}).email))));

// ── Admin ─────────────────────────────────────
router.post('/admin/login', limit(5, 'Too many attempts. Try again in a minute.'),
  wrap(async (req, res) => {
    const b = req.body || {};
    res.json({ ok: true, token: svc.login(b.email, b.password) });
  }));

router.use('/admin', svc.requireShareAdmin);

router.get('/admin/data', wrap(async (req, res) => res.json(await svc.adminData())));
router.post('/admin/settings', wrap(async (req, res) => res.json(await svc.updateSettings(req.body || {}))));
router.post('/admin/bookings/:id/:action', wrap(async (req, res) => {
  if (!['cancel', 'restore', 'delete'].includes(req.params.action)) return res.status(404).json({ error: 'Not found' });
  res.json(await svc.bookingAction(req.params.id, req.params.action));
}));
router.get('/admin/export.csv', wrap(async (req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="aladino-share-bookings.csv"' });
  res.send(await svc.exportCsv());
}));

module.exports = router;
