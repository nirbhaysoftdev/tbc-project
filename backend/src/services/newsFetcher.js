// src/services/newsFetcher.js
//
// Pulls business headlines from publishers' public RSS feeds into news_items.
//
// WHY RSS, AND WHY HERE
// RSS is what publishers offer for exactly this: a headline, a short snippet
// and a link back. No key, no quota, nothing to leak. The fetch happens on the
// server on a timer - never in the browser - so a visitor cannot spend a rate
// limit or see a credential, and the landing page stays a static export.
//
// WHAT IS STORED
// Headline, a snippet capped at SNIPPET_MAX, the source name and the link. Not
// the article. Every card on the site links out to the publisher.
//
// FAILURE IS QUIET
// One feed being down loses that feed's latest items and nothing else; all
// feeds being down leaves the last good set on screen. Nothing here throws to
// the caller.
const { XMLParser } = require('fast-xml-parser');
const prisma = require('../utils/prismaClient');

const FEEDS = [
  { source: 'BBC News',     url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { source: 'The Guardian', url: 'https://www.theguardian.com/uk/business/rss' },
  { source: 'CNBC',         url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html' },
  { source: 'MarketWatch',  url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'NPR',          url: 'https://feeds.npr.org/1006/rss.xml' },
];

const CONFIG = {
  enabled: process.env.NEWS_ENABLED !== 'false',
  intervalMs: Number(process.env.NEWS_REFRESH_MINUTES || 40) * 60 * 1000,
  fetchTimeoutMs: 10000,
  retentionDays: 7,
  perFeedMax: 25,
};

const SNIPPET_MAX = 280;
const TITLE_MAX = 300;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // The default ceiling (1000 expansions) is below what one Guardian feed
  // legitimately contains - every description is entity-encoded HTML. Still
  // bounded, so a hostile feed cannot become an expansion bomb.
  processEntities: { enabled: true, maxTotalExpansions: 20000, maxExpansionDepth: 5 },
  trimValues: true,
});

let timer = null;
let running = false;
let lastRun = null;

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Feeds put HTML and entities in titles and descriptions; we store plain text. */
function decode(s) {
  return s
    // Numeric references (&#8217; and &#x2019;) - the curly apostrophe in half
    // the headlines. An out-of-range code point is left as it was written.
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (m, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      try { return String.fromCodePoint(n); } catch { return m; }
    })
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function plain(value) {
  if (value == null) return '';
  const raw = typeof value === 'object' ? (value['#text'] ?? '') : String(value);
  // Decode BEFORE stripping: some feeds entity-encode their markup, so the tags
  // only become tags once decoded. Only tag-shaped text is removed, so a plain
  // "a < b" survives.
  return decode(raw)
    .replace(/<\/?[a-zA-Z!][^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

/** Only http(s) links are ever stored: the value ends up in an href. */
function safeUrl(v) {
  const raw = typeof v === 'object' ? v?.['#text'] : v;
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

function imageOf(item) {
  const candidates = [
    ...asArray(item['media:thumbnail']),
    ...asArray(item['media:content']),
    ...asArray(item.enclosure),
  ];
  for (const c of candidates) {
    const url = safeUrl(c?.['@_url']);
    const type = c?.['@_type'] || '';
    if (url && url.startsWith('https:') && (!type || type.startsWith('image'))) return url;
  }
  return null;
}

function normalise(item, source) {
  const url = safeUrl(item.link) || safeUrl(item.guid);
  const title = clip(plain(item.title), TITLE_MAX);
  if (!url || !title) return null;

  let publishedAt = new Date(item.pubDate || item['dc:date'] || Date.now());
  const now = Date.now();
  // A missing or unparseable date, or one in the future, would pin a story to
  // the top of the feed forever.
  if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() > now) publishedAt = new Date(now);

  let summary = clip(plain(item.description), SNIPPET_MAX);
  // Some feeds repeat the headline as the description.
  if (!summary || summary.toLowerCase() === title.toLowerCase()) summary = null;

  return { url, title, summary, source, imageUrl: imageOf(item), publishedAt };
}

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.fetchTimeoutMs);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'TBC-Portal/1.0 (+news reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const doc = parser.parse(xml);
    const items = asArray(doc?.rss?.channel?.item).slice(0, CONFIG.perFeedMax);
    return items.map((i) => normalise(i, feed.source)).filter(Boolean);
  } finally {
    clearTimeout(t);
  }
}

/** One pass over every feed. Returns a per-source report; never throws. */
async function refresh() {
  if (running) return { skipped: true };
  running = true;
  const report = {};
  try {
    for (const feed of FEEDS) {
      try {
        // Anything already past retention is skipped here, not inserted and
        // pruned: a feed that carries a week-old story would otherwise churn it
        // in and out on every pass.
        const oldest = Date.now() - CONFIG.retentionDays * 24 * 60 * 60 * 1000;
        const rows = (await fetchFeed(feed)).filter((r) => r.publishedAt.getTime() >= oldest);
        let added = 0;
        for (const r of rows) {
          // Upsert on the URL. `update` is empty on purpose: a story already
          // stored keeps its original row, so re-fetching never reorders it.
          const exists = await prisma.newsItem.findUnique({ where: { url: r.url }, select: { id: true } });
          if (!exists) { await prisma.newsItem.create({ data: r }); added += 1; }
        }
        report[feed.source] = { ok: true, fetched: rows.length, added };
      } catch (err) {
        report[feed.source] = { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
      }
    }
    const cutoff = new Date(Date.now() - CONFIG.retentionDays * 24 * 60 * 60 * 1000);
    await prisma.newsItem.deleteMany({ where: { publishedAt: { lt: cutoff } } }).catch(() => {});
    lastRun = { at: new Date(), report };
  } catch (err) {
    console.error('   ✗  news refresh failed -', err.message);
  } finally {
    running = false;
  }
  return report;
}

function start() {
  if (!CONFIG.enabled || timer) return;
  // First pass shortly after boot so a fresh deploy has headlines without
  // waiting a full interval, but not so soon that it competes with startup.
  setTimeout(() => { refresh().catch(() => {}); }, 5000).unref?.();
  timer = setInterval(() => { refresh().catch(() => {}); }, CONFIG.intervalMs);
  timer.unref?.();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, refresh, status: () => lastRun, FEEDS, _normalise: normalise };
