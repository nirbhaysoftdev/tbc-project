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
const profileRoutes     = require('./routes/profile');
const systemRoutes      = require('./routes/system');
const withdrawRoutes    = require('./routes/withdraw');
const communityRoutes   = require('./routes/community');
const eventsRoutes      = require('./routes/events');
const messagesRoutes    = require('./routes/messages');
const projectsRoutes    = require('./routes/projects');
const userRoutes        = require('./routes/user');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security headers ──────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── Body parsers ──────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads ────────────────────────────
// ── Static uploads ────────────────────────────
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET');
  next();
}, express.static(path.join(__dirname, '../uploads')));
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
app.use('/api/dashboard',    dashboardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/profile',      profileRoutes);
app.use('/api/system',       systemRoutes);
app.use('/api/withdraw',     withdrawRoutes);
app.use('/api/community',    communityRoutes);
app.use('/api/events',       eventsRoutes);
app.use('/api/messages',     messagesRoutes);
app.use('/api/projects',     projectsRoutes);
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

app.listen(PORT, async () => {
  console.log(`\n🚀 TBC API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);

  // ── PostgreSQL connection check ───────────────
  try {
    await prisma.$connect();
    console.log(`   🐘 PostgreSQL connected\n`);
  } catch (err) {
    console.error(`   ✗  PostgreSQL NOT connected - ${err.message}`);
    console.error(`   Check DATABASE_URL in .env and ensure PostgreSQL is running.\n`);
  }
});
