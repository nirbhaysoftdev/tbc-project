// src/routes/i18n.js
//
// Public and admin endpoints for the multilingual system.
//
// Everything that costs money or touches content is behind authentication and
// the admin check. The only unauthenticated route is /suggest, which performs
// no lookup and returns no user data.

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { authenticate, requireAdmin } = require('../middleware/auth');
const { LANGUAGES, DEFAULT_LANGUAGE, SUPPORTED, normalizeLanguage } = require('../services/i18n/languages');
const translationService = require('../services/i18n/translationService');
const worker = require('../services/i18n/worker');
const { isTranslatableField } = require('../services/i18n/translatable');

/**
 * Country → language. Used ONLY as the weakest hint in the frontend's
 * precedence chain, and only when nothing else is known.
 *
 * Kept in sync with the identical table in I18nProvider.tsx — duplicated
 * rather than shared because the two runtimes do not share a module system,
 * and the frontend needs it to interpret a bare country code.
 */
const COUNTRY_LANGUAGE = {
  IT: 'it', SM: 'it', VA: 'it', CH: 'it',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', AM: 'ru', AZ: 'ru', MD: 'ru', UZ: 'ru', TJ: 'ru',
  IR: 'fa', AF: 'fa',
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', EG: 'ar', JO: 'ar',
  LB: 'ar', IQ: 'ar', SY: 'ar', LY: 'ar', MA: 'ar', TN: 'ar', DZ: 'ar', SD: 'ar',
  YE: 'ar', PS: 'ar', MR: 'ar',
};

// Public and therefore rate-limited. Cheap, but not free to serve.
const suggestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

/**
 * GET /api/i18n/suggest
 *
 * The optional IP-based suggestion from §5, implemented without a geolocation
 * provider, without an API secret and without a per-request lookup.
 *
 * The country is read from headers a reverse proxy or CDN already attaches. If
 * none is present the answer is simply "no suggestion", and the frontend falls
 * through to browser language and then English. A VPN, a proxy, a datacentre
 * IP or an unsupported country all produce the same harmless null.
 *
 * Returns no personal data: a two-letter country and a two-letter language.
 * The client IP itself is never echoed back or logged here.
 */
router.get('/suggest', suggestLimiter, (req, res) => {
  const country =
    req.headers['cf-ipcountry'] ||          // Cloudflare
    req.headers['x-vercel-ip-country'] ||   // Vercel
    req.headers['x-geo-country'] ||         // generic / nginx GeoIP
    req.headers['x-country-code'] ||
    null;

  const normalised = typeof country === 'string' ? country.trim().toUpperCase() : null;
  // "XX" and "T1" are what proxies emit for unknown and Tor respectively.
  const usable = normalised && /^[A-Z]{2}$/.test(normalised) && !['XX', 'T1'].includes(normalised)
    ? normalised
    : null;

  res.json({
    country: usable,
    language: usable ? COUNTRY_LANGUAGE[usable] || null : null,
    // Echoed so a client can show the catalogue without a second request.
    supported: SUPPORTED,
    default: DEFAULT_LANGUAGE,
  });
});

/**
 * GET /api/i18n/languages
 * The catalogue, so a client never has to hardcode the list.
 */
router.get('/languages', (req, res) => {
  res.json({
    languages: LANGUAGES,
    default: DEFAULT_LANGUAGE,
    current: req.language,
  });
});

// ── Everything below is admin-only ──────────────────────────────────────────
// Translation management is content management, so it reuses the existing
// access-control rules rather than inventing its own (§13).

/**
 * GET /api/i18n/admin/stats
 * Queue depth and coverage per language — what is translated, what is
 * outdated, what failed.
 */
router.get('/admin/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = await translationService.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[i18n] stats failed', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/i18n/admin/retry
 * Re-queue dead jobs, optionally narrowed to one entity or language.
 */
router.post('/admin/retry', authenticate, requireAdmin, async (req, res) => {
  try {
    const { entityType, entityId, language } = req.body || {};
    const lang = language ? normalizeLanguage(language) : undefined;
    if (language && !lang) return res.status(400).json({ error: 'Unsupported language' });

    const requeued = await worker.retryDeadJobs({ entityType, entityId, language: lang });
    // Run immediately rather than waiting for the next interval, so an admin
    // clicking "retry" sees movement.
    void worker.tick();
    res.json({ requeued });
  } catch (err) {
    console.error('[i18n] retry failed', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/i18n/admin/review
 * Record a human-reviewed translation, optionally correcting the text.
 * A reviewed translation is never overwritten by a later machine job.
 */
router.put('/admin/review', authenticate, requireAdmin, async (req, res) => {
  try {
    const { entityType, entityId, field, language, value } = req.body || {};

    const lang = normalizeLanguage(language);
    if (!lang || lang === DEFAULT_LANGUAGE) {
      return res.status(400).json({ error: 'A target language other than English is required' });
    }
    if (!entityType || !entityId || !field) {
      return res.status(400).json({ error: 'entityType, entityId and field are required' });
    }
    if (!isTranslatableField(entityType, field)) {
      return res.status(400).json({ error: `${entityType}.${field} is not a translatable field` });
    }
    // Bounded so this endpoint cannot be used to store an arbitrary blob.
    if (typeof value === 'string' && value.length > 100_000) {
      return res.status(413).json({ error: 'Translation is too large' });
    }

    const updated = await translationService.markReviewed({
      entityType, entityId, field, language: lang, value, reviewerId: req.user.id,
    });
    res.json({ translation: updated });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'No translation exists for that field and language yet' });
    }
    console.error('[i18n] review failed', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
