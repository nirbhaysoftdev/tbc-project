// src/routes/news.js
//
// Business headlines, in two deliberately different shapes:
//
//   GET /api/news/headlines   PUBLIC  the landing page: title, snippet, image,
//                                     a derived category, source and time. No
//                                     link - reading the story is for members.
//   GET /api/news/markets     PUBLIC  index / commodity / FX / Bitcoin quotes for
//                                     the landing page's markets bar.
//   GET /api/news             MEMBER  the portal's news page. Adds the snippet
//                                     and image, with paging and a source filter.
//   POST /api/news/refresh    ADMIN   fetch now instead of waiting for the timer.
//
// The public routes exist so the marketing page needs no session. What stays
// behind `authenticate` is the browsable archive: search, source filter, paging.
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../utils/prismaClient');
const { authenticate, requireAdmin, requireActive } = require('../middleware/auth');
const fetcher = require('../services/newsFetcher');
const markets = require('../services/marketFetcher');
const { categoryOf, betterImage } = require('../services/newsCategory');

const router = express.Router();

const intParam = (v, fallback, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ── Public ────────────────────────────────────
router.get(
  '/headlines',
  rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false, message: { error: 'Too many requests.' } }),
  async (req, res) => {
    try {
      const limit = intParam(req.query.limit, 8, 1, 12);
      // Newest first, but at most PER_SOURCE from any one publisher. Without the
      // cap the landing page is whoever published most recently: one wire that
      // posts every few minutes fills every slot, and a business page ends up
      // showing a single outlet's lifestyle section.
      const PER_SOURCE = 2;
      const pool = await prisma.newsItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 80,
        // No `url`: the full story is for signed-in members, so the public
        // payload must not hand out the publisher link either.
        select: { id: true, title: true, summary: true, source: true, imageUrl: true, publishedAt: true },
      });
      const seen = {};
      const rows = pool.filter((r) => (seen[r.source] = (seen[r.source] || 0) + 1) <= PER_SOURCE).slice(0, limit);
      res.set('Cache-Control', 'public, max-age=300');
      res.json({
        headlines: rows.map((r) => ({ ...r, imageUrl: betterImage(r.imageUrl), category: categoryOf(r.title, r.summary) })),
      });
    } catch (err) {
      console.error('news headlines error:', err.message);
      // A broken news strip must not break the landing page.
      res.json({ headlines: [] });
    }
  }
);

router.get(
  '/markets',
  rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false, message: { error: 'Too many requests.' } }),
  (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ quotes: markets.current() });
  }
);

// ── Admin ─────────────────────────────────────
router.post('/refresh', authenticate, requireAdmin, async (_req, res) => {
  const report = await fetcher.refresh();
  res.json({ report });
});

router.get('/status', authenticate, requireAdmin, (_req, res) => {
  res.json({ lastRun: fetcher.status(), sources: fetcher.FEEDS.map((f) => f.source) });
});

// ── Members ───────────────────────────────────
router.get('/', authenticate, requireActive, async (req, res) => {
  try {
    const limit = intParam(req.query.limit, 18, 1, 50);
    const page = intParam(req.query.page, 1, 1, 100);
    const where = {};
    if (req.query.source) where.source = String(req.query.source);
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total, sources] = await Promise.all([
      prisma.newsItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, title: true, summary: true, source: true, url: true, imageUrl: true, publishedAt: true },
      }),
      prisma.newsItem.count({ where }),
      prisma.newsItem.groupBy({ by: ['source'], _count: { source: true }, orderBy: { source: 'asc' } }),
    ]);

    res.json({
      items,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      sources: sources.map((s) => ({ value: s.source, count: s._count.source })),
    });
  } catch (err) {
    console.error('news list error:', err.message);
    res.status(500).json({ error: 'Could not load the news.' });
  }
});

module.exports = router;
