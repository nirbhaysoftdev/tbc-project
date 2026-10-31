// src/services/trafficTracker.js
//
// The write side of traffic analytics: turns a page beat, a login, a logout or
// a signup into rows in analytics_sessions / analytics_events. The read side is
// services/trafficAnalytics.js, and nothing here is reachable by an admin
// request - ingestion is the public `/api/track` route.
//
// PRIVACY, in one place:
//  - A browser that sends Do-Not-Track or Global Privacy Control is not
//    recorded at all. No row, no cookie-equivalent id server-side.
//  - The visitor id is a random UUID the browser made for itself. It is not
//    derived from the IP or a fingerprint, and clearing site data starts a new
//    visitor.
//  - A page's query string and fragment are dropped before storage, because a
//    reset or invitation link carries a secret there.
//  - The raw IP is stored (the admin screen needs it) but is only ever shown
//    whole to a SUPER_ADMIN - see maskIp in trafficAnalytics.js. Rows are
//    deleted after ANALYTICS_RETENTION_DAYS (365).
//
// Tracking must NEVER break the thing being tracked: every public function
// here swallows its own errors.
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

// The window inside which a session counts as "live". Beats go out every 30s
// from a visible tab, so 90s tolerates two missed ones.
const LIVE_WINDOW_MS = 90 * 1000;

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|headless|lighthouse|curl|wget|python-requests|uptime/i;

const SEARCH_HOSTS = { 'google.': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'yahoo.': 'Yahoo', 'baidu.com': 'Baidu', 'yandex.': 'Yandex', 'ecosia.org': 'Ecosia' };
const SOCIAL_HOSTS = {
  'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn', 'facebook.com': 'Facebook', 'fb.com': 'Facebook',
  'instagram.com': 'Instagram', 'twitter.com': 'X', 't.co': 'X', 'x.com': 'X', 'youtube.com': 'YouTube',
  'whatsapp.com': 'WhatsApp', 'wa.me': 'WhatsApp', 't.me': 'Telegram', 'telegram.org': 'Telegram',
};

// ── Request facts ─────────────────────────────

/**
 * The caller's address. Behind nginx the socket address is the proxy, so the
 * proxy's own header wins: `X-Real-IP` if nginx sets it, else the RIGHTMOST
 * `X-Forwarded-For` entry - the one our proxy appended. The leftmost is
 * whatever the client claimed, which is why it is not used.
 */
function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim().slice(0, 64);
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const last = String(xff).split(',').pop().trim();
    if (last) return last.slice(0, 64);
  }
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64) || null;
}

const isPrivateIp = (ip) => !ip
  || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  || ip === '::1' || /^(fc|fd|fe80)/i.test(ip);

let geoLookup;
/** Country (ISO code) and city. Header from a CDN first, then the bundled database. */
function geoFor(req, ip) {
  const cc = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const cdnCity = req.headers['cf-ipcity'] || req.headers['x-vercel-ip-city'];
  if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1') {
    return { country: cc, city: cdnCity ? decodeURIComponent(String(cdnCity)).slice(0, 80) : null };
  }
  if (isPrivateIp(ip)) return { country: null, city: null };
  try {
    // Loaded on first use: the database is read into memory (~100MB) and a
    // deployment behind a CDN that sends the header above never needs it.
    if (geoLookup === undefined) geoLookup = require('geoip-lite').lookup;
    const hit = geoLookup(ip);
    return { country: hit?.country || null, city: hit?.city || null };
  } catch {
    geoLookup = null;
    return { country: null, city: null };
  }
}

function deviceFor(userAgent) {
  try {
    const UAParser = require('ua-parser-js');
    const r = new UAParser(userAgent || '').getResult();
    const kind = r.device?.type;
    return {
      device: kind === 'mobile' ? 'Mobile' : kind === 'tablet' ? 'Tablet' : 'Desktop',
      browser: r.browser?.name || 'Other',
      os: r.os?.name || null,
    };
  } catch {
    return { device: 'Desktop', browser: 'Other', os: null };
  }
}

function sourceFor(referrer, utm) {
  if (utm) return `Campaign: ${String(utm).slice(0, 40)}`;
  if (!referrer) return 'Direct';
  let host;
  try { host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase(); } catch { return 'Direct'; }
  const own = (process.env.FRONTEND_URL || '').split(',').map((o) => { try { return new URL(o.trim()).hostname.replace(/^www\./, ''); } catch { return ''; } });
  if (own.includes(host)) return 'Direct';
  for (const [needle, name] of Object.entries(SEARCH_HOSTS)) if (host.includes(needle)) return name;
  for (const [needle, name] of Object.entries(SOCIAL_HOSTS)) if (host === needle || host.endsWith(`.${needle}`)) return name;
  return host.slice(0, 80);
}

/** A path with the query and fragment removed and the length bounded. */
function cleanPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) return null;
  const bare = p.split('#')[0].split('?')[0].replace(/\/+$/, '');
  return (bare || '/').slice(0, 200);
}

/** The signed-in user a request carries, or null. Impersonation is reported, not honoured. */
function tokenUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { userId: null, impersonated: false };
  try {
    const d = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    return { userId: d.userId || null, impersonated: Boolean(d.impersonatedBy) };
  } catch {
    return { userId: null, impersonated: false };
  }
}

const optedOut = (req) => req.headers.dnt === '1' || req.headers['sec-gpc'] === '1';
const isBot = (req) => BOT.test(String(req.headers['user-agent'] || ''));

// ── Page beats ────────────────────────────────

/**
 * One beat from the browser. `kind`: 'view' (a page was shown), 'beat' (still
 * here) or 'end' (the tab is closing). Returns nothing; never throws.
 */
async function recordBeat(req, body = {}) {
  try {
    if (optedOut(req) || isBot(req)) return;
    const { userId, impersonated } = tokenUser(req);
    // A super admin looking at the portal AS a member is not that member
    // being active, and must not inflate or pollute their history.
    if (impersonated) return;

    const sessionId = String(body.sessionId || '');
    const visitorId = String(body.visitorId || '');
    if (!SESSION_ID.test(sessionId) || !SESSION_ID.test(visitorId)) return;
    const kind = ['view', 'beat', 'end'].includes(body.kind) ? body.kind : 'beat';
    const path = cleanPath(body.path);
    const now = new Date();

    const existing = await prisma.analyticsSession.findUnique({
      where: { id: sessionId }, select: { visitorId: true, userId: true, endedAt: true },
    });
    // A session id that belongs to another visitor is a forgery or a clash;
    // either way it must not be written to.
    if (existing && existing.visitorId !== visitorId) return;

    if (!existing) {
      if (!path) return;
      const ip = clientIp(req);
      const geo = geoFor(req, ip);
      const ua = deviceFor(req.headers['user-agent']);
      const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 300) : null;
      await prisma.analyticsSession.create({
        data: {
          id: sessionId, visitorId, userId, ip, ...geo, ...ua,
          source: sourceFor(referrer, body.utm),
          referrer: referrer || null,
          landingPath: path, currentPath: path,
          loggedInAt: userId ? now : null,
          startedAt: now, lastSeenAt: now,
        },
      });
      await prisma.analyticsEvent.create({
        data: { type: 'PAGE_VIEW', sessionId, visitorId, userId, path, ip, ...geo, device: ua.device, browser: ua.browser },
      });
      return;
    }

    const data = { lastSeenAt: now };
    if (userId && !existing.userId) { data.userId = userId; data.loggedInAt = now; }
    if (kind === 'end') data.endedAt = now;
    // A beat after an 'end' (a restored tab) revives the session.
    else if (existing.endedAt) data.endedAt = null;

    if (kind === 'view' && path) {
      data.currentPath = path;
      data.pageViews = { increment: 1 };
    }
    const row = await prisma.analyticsSession.update({
      where: { id: sessionId }, data,
      select: { ip: true, country: true, city: true, device: true, browser: true, userId: true },
    });
    if (kind === 'view' && path) {
      await prisma.analyticsEvent.create({
        data: { type: 'PAGE_VIEW', sessionId, visitorId, userId: row.userId, path, ip: row.ip, country: row.country, city: row.city, device: row.device, browser: row.browser },
      });
    }
  } catch (err) {
    console.error('traffic beat failed:', err.message);
  }
}

// ── Auth events ───────────────────────────────

/**
 * Record a login, failed login, logout or signup.
 *
 * Unlike a page beat this is NOT subject to Do-Not-Track: it is a security
 * record of who tried to enter the portal, kept for the same reason the
 * activity log is. It carries no page, no referrer and no browsing history.
 *
 * `userId` is passed by the caller (it knows who signed in); `email` is kept
 * for failures, where there may be no user row at all.
 */
async function recordAuth(req, { type, userId = null, email = null }) {
  try {
    const ip = clientIp(req);
    const geo = geoFor(req, ip);
    const ua = deviceFor(req.headers['user-agent']);
    const sessionHeader = String(req.headers['x-analytics-session'] || '');
    const visitorHeader = String(req.headers['x-analytics-visitor'] || '');
    let sessionId = SESSION_ID.test(sessionHeader) ? sessionHeader : null;
    const visitorId = SESSION_ID.test(visitorHeader) ? visitorHeader : null;

    if (sessionId) {
      const s = await prisma.analyticsSession.findUnique({ where: { id: sessionId }, select: { visitorId: true } });
      if (!s || (visitorId && s.visitorId !== visitorId)) sessionId = null;
    }

    await prisma.analyticsEvent.create({
      data: {
        type, sessionId, visitorId, userId,
        email: email ? String(email).toLowerCase().slice(0, 200) : null,
        ip, ...geo, device: ua.device, browser: ua.browser,
      },
    });

    if (sessionId && userId && type === 'LOGIN_SUCCESS') {
      await prisma.analyticsSession.update({ where: { id: sessionId }, data: { userId, loggedInAt: new Date(), lastSeenAt: new Date() } });
    }
    if (sessionId && type === 'LOGOUT') {
      await prisma.analyticsSession.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    }
  } catch (err) {
    console.error('traffic auth event failed:', err.message);
  }
}

// ── Retention ─────────────────────────────────

const RETENTION_DAYS = Math.max(30, parseInt(process.env.ANALYTICS_RETENTION_DAYS, 10) || 365);

async function purgeOld() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
  try {
    const events = await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const sessions = await prisma.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
    if (events.count || sessions.count) console.log(`   analytics retention: removed ${events.count} events, ${sessions.count} sessions`);
  } catch (err) {
    console.error('analytics purge failed:', err.message);
  }
}

let purgeTimer = null;
function startRetention() {
  if (purgeTimer) return;
  setTimeout(purgeOld, 60 * 1000).unref();
  purgeTimer = setInterval(purgeOld, 24 * 3600 * 1000);
  purgeTimer.unref();
}

module.exports = {
  recordBeat, recordAuth, startRetention, purgeOld,
  LIVE_WINDOW_MS, RETENTION_DAYS, clientIp, tokenUser,
};
