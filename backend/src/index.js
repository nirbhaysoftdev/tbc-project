// src/index.js
// Trillion Business Community – Express API Server

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes        = require('./routes/auth');
const dashboardRoutes   = require('./routes/dashboard');
const transactionRoutes = require('./routes/transactions');
const adminRoutes       = require('./routes/admin');
const adminEventsRoutes = require('./routes/adminEvents');
const adminAnalyticsRoutes = require('./routes/adminAnalytics');
const investmentRoutes  = require('./routes/investments');
const superAdminRoutes  = require('./routes/superAdmin');
const profileRoutes     = require('./routes/profile');
const withdrawRoutes    = require('./routes/withdraw');
const communityRoutes   = require('./routes/community');
const eventsRoutes      = require('./routes/events');
const messagesRoutes    = require('./routes/messages');
const projectsRoutes    = require('./routes/projects');
const companiesRoutes   = require('./routes/companies');
const enquiryRoutes     = require('./routes/enquiries');
const userRoutes        = require('./routes/user');
const uploadsRoutes     = require('./routes/uploads');
const filesRoutes       = require('./routes/files');
const i18nRoutes        = require('./routes/i18n');

const { languageMiddleware } = require('./middleware/language');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security headers ──────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────
// FRONTEND_URL may hold SEVERAL origins, comma-separated, and should name
// every hostname the portal is actually reachable at.
//
// It is one value in production and that is the point of the list: a second
// hostname that serves the same site - `www.` beside the apex, a staging
// name, a bare IP - is a DIFFERENT ORIGIN to a browser. The portal's bundle
// calls the API at one absolute URL, so a member who opened the `www.`
// address has every single request blocked by CORS, with no response body for
// the UI to explain itself with. It reads as "login failed" on one device
// while the same credentials work everywhere else. A redirect to one
// canonical host is the real fix; this list is so the failure mode cannot be
// total while that is wrong.
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/** The origin to echo back, or null for "not allowed". */
function allowedOrigin(origin) {
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin.replace(/\/+$/, '')) ? origin : null;
}

app.use(cors({
  // A request with no Origin at all (curl, a server-to-server call, an app
  // webview) is not a browser enforcing anything, so it is left alone.
  origin: (origin, callback) => callback(null, !origin || Boolean(allowedOrigin(origin))),
  credentials: true,
}));

// ── Body parsers ──────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request language ──────────────────────────
// Resolves Accept-Language (or ?lang=, or the tbc_lang cookie) to a supported
// code on req.language, once, for every route below. Controllers never parse a
// header themselves. See middleware/language.js.
app.use(languageMiddleware);

// ── Uploads ───────────────────────────────────
// NOT express.static: identity documents live beside profile photos, so every
// request is authorised against the database. See routes/uploads.js.
app.use('/uploads', (req, res, next) => {
  // Echo the caller's own origin when it is one of ours; a fixed value here
  // would be wrong for every hostname but the first in the list.
  res.header('Access-Control-Allow-Origin', allowedOrigin(req.headers.origin) || ALLOWED_ORIGINS[0]);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET');
  next();
}, uploadsRoutes);
// ── Global rate limiter ───────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      1000,
  message:  { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ── Auth rate limiter ─────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { error: 'Too many login attempts, please try again later.' },
});

// ── Routes ────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes);
app.use('/api/i18n',         i18nRoutes);
app.use('/api/files',        filesRoutes);
app.use('/api/dashboard',    dashboardRoutes);
app.use('/api/transactions', transactionRoutes);
// BEFORE adminRoutes, and that order is load-bearing. routes/admin.js gates
// its whole router with `router.use(authenticate, requireAdmin)`, which runs
// for every request that enters it - including paths it does not define. The
// event feed accepts an API key instead of a session, so mounted after
// adminRoutes it would be answered with 401 "No token provided" before its own
// gate was ever reached.
app.use('/api/admin',        adminEventsRoutes);
// The Overview's figures. Its own router for the same reason - and above
// adminRoutes purely to keep the three /api/admin mounts together.
app.use('/api/admin',        adminAnalyticsRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/admin',        investmentRoutes);
app.use('/api/super-admin',  superAdminRoutes);
app.use('/api/profile',      profileRoutes);
app.use('/api/withdraw',     withdrawRoutes);
app.use('/api/community',    communityRoutes);
app.use('/api/events',       eventsRoutes);
app.use('/api/messages',     messagesRoutes);
app.use('/api/projects',     projectsRoutes);
app.use('/api/companies',    companiesRoutes);
app.use('/api/enquiries',    enquiryRoutes);
app.use('/api/user',         userRoutes);        // MMS onboarding

// ── Health check ──────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────
const prisma = require('./utils/prismaClient');
const translationWorker = require('./services/i18n/worker');
const announcementWorker = require('./services/announcementWorker');

app.listen(PORT, async () => {
  console.log(`\n🚀 TBC API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);

  // ── PostgreSQL connection check ───────────────
  try {
    await prisma.$connect();
    console.log(`   🐘 PostgreSQL connected\n`);

    // The translation worker is the queue consumer for dynamic content. It is
    // started only after the database is reachable, because its queue IS a
    // table. A failure to start it is logged and ignored: the API, including
    // every admin save, works without it — content simply stays English.
    try {
      translationWorker.start();
    } catch (err) {
      console.error(`   ✗  translation worker not started - ${err.message}`);
    }

    // The announcement sender, on the same terms: its queue is a table, so a
    // failure to start it delays announcement emails but loses none of them,
    // and the API - including launching a project - works without it.
    try {
      announcementWorker.start();
    } catch (err) {
      console.error(`   ✗  announcement worker not started - ${err.message}`);
    }
  } catch (err) {
    console.error(`   ✗  PostgreSQL NOT connected - ${err.message}`);
    console.error(`   Check DATABASE_URL in .env and ensure PostgreSQL is running.\n`);
  }
});
