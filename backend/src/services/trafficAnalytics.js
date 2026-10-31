// src/services/trafficAnalytics.js
//
// The read side of traffic analytics. Everything here is a SELECT: the admin
// module is read-only by construction, and no function in this file writes.
//
// One filter object drives every query, so "filters work across historical and
// live analytics" is a property of the code rather than of each screen:
//
//   range/from/to  sessions that OVERLAP the window (started before its end,
//                  last seen after its start) - a session that began yesterday
//                  and is still open is part of "today"
//   status         live | ended | all
//   audience       all | guest | member
//   q              name or email substring of the signed-in user
//   userId, country (ISO code), ip, device, browser
//
// Aggregates are raw SQL because Prisma cannot COUNT(DISTINCT) over a
// truncated date. They hit the indexes on analytics_sessions(startedAt,
// lastSeenAt, visitorId+startedAt, userId+startedAt).
const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prismaClient');
const { LIVE_WINDOW_MS } = require('./trafficTracker');

const DAY = 86400000;
const RANGES = ['today', '7d', '30d', '90d', 'custom'];
const GRANULARITIES = ['day', 'week', 'month'];
const MAX_SPAN_DAYS = 366;
const MAX_EXPORT_ROWS = 50000;

// ── Helpers ───────────────────────────────────

const num = (v) => (v == null ? 0 : Number(v));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

let regionNames;
function countryName(code) {
  if (!code) return 'Unknown';
  try {
    regionNames = regionNames || new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * ADMINs see the network, not the host: the last IPv4 octet (or the last five
 * IPv6 groups) is replaced. Only a SUPER_ADMIN sees an address whole. That is
 * the privacy permission this module applies - an IP is personal data, and
 * "may see what a visitor did" is a smaller grant than "may identify their
 * connection".
 */
function maskIp(ip, role) {
  if (!ip) return null;
  if (role === 'SUPER_ADMIN') return ip;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  const o = ip.split('.');
  return o.length === 4 ? `${o[0]}.${o[1]}.${o[2]}.x` : '…';
}

/** Parse and validate query params into the one filter object. `{ error }` on a bad value. */
function parseFilters(q = {}, role) {
  const rangeKey = RANGES.includes(q.range) ? q.range : '7d';
  const now = new Date();
  let from; let to = now;

  if (rangeKey === 'custom') {
    from = new Date(q.from); to = new Date(q.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: 'A custom range needs valid from and to dates.' };
    // A bare date as the end means "through the end of that day".
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to = new Date(to.getTime() + DAY - 1);
    if (from > to) return { error: 'The start of the range is after its end.' };
    if ((to - from) / DAY > MAX_SPAN_DAYS) return { error: `Ranges are limited to ${MAX_SPAN_DAYS} days.` };
  } else if (rangeKey === 'today') {
    from = new Date(now); from.setUTCHours(0, 0, 0, 0);
  } else {
    from = new Date(now.getTime() - parseInt(rangeKey, 10) * DAY);
  }

  const spanDays = (to - from) / DAY;
  const granularity = GRANULARITIES.includes(q.granularity) ? q.granularity : spanDays > 120 ? 'month' : spanDays > 45 ? 'week' : 'day';

  const ip = q.ip ? String(q.ip).trim().slice(0, 45) : null;
  if (ip && role !== 'SUPER_ADMIN') {
    // An ADMIN is shown the masked address, so may only search on the part of
    // it they can see. A full-address search would let them recover the
    // hidden octet one guess at a time.
    const parts = ip.split(ip.includes(':') ? ':' : '.').filter(Boolean);
    if (parts.length > 3) return { error: 'Filter by the first three parts of an address only.' };
  }

  const str = (v, n = 100) => (v ? String(v).trim().slice(0, n) : null);
  return {
    range: rangeKey, from, to, granularity,
    status: ['live', 'ended'].includes(q.status) ? q.status : 'all',
    audience: ['guest', 'member'].includes(q.audience) ? q.audience : 'all',
    q: str(q.q), userId: str(q.userId, 64), country: str(q.country, 2)?.toUpperCase() || null,
    ip, device: str(q.device, 20), browser: str(q.browser, 40),
  };
}

/**
 * A Date as a UTC `timestamp`. Prisma sends a Date parameter as timestamptz and
 * stores timestamps as UTC without a zone, so comparing the two directly makes
 * Postgres reinterpret the column in the SESSION's zone - on a server set to
 * Asia/Kolkata that is a 5.5 hour skew, and "last seen 10 seconds ago" is not
 * live. Every Date that meets a timestamp column in raw SQL goes through here.
 */
const ts = (d) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

const liveCutoff = () => new Date(Date.now() - LIVE_WINDOW_MS);
const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

/** WHERE for analytics_sessions s LEFT JOIN users u. */
function sessionWhere(f, { skipStatus = false } = {}) {
  const c = [Prisma.sql`s."startedAt" <= ${ts(f.to)}`, Prisma.sql`s."lastSeenAt" >= ${ts(f.from)}`];
  if (f.audience === 'guest') c.push(Prisma.sql`s."userId" IS NULL`);
  if (f.audience === 'member') c.push(Prisma.sql`s."userId" IS NOT NULL`);
  if (f.userId) c.push(Prisma.sql`s."userId" = ${f.userId}`);
  if (f.q) c.push(Prisma.sql`(u.name ILIKE ${like(f.q)} OR u.email ILIKE ${like(f.q)} OR s."visitorId" = ${f.q})`);
  if (f.country) c.push(Prisma.sql`s.country = ${f.country}`);
  if (f.ip) c.push(Prisma.sql`s.ip LIKE ${`${f.ip.replace(/[\\%_]/g, '\\$&')}%`}`);
  if (f.device) c.push(Prisma.sql`s.device = ${f.device}`);
  if (f.browser) c.push(Prisma.sql`s.browser = ${f.browser}`);
  if (!skipStatus && f.status === 'live') c.push(Prisma.sql`(s."lastSeenAt" > ${ts(liveCutoff())} AND s."endedAt" IS NULL)`);
  if (!skipStatus && f.status === 'ended') c.push(Prisma.sql`(s."lastSeenAt" <= ${ts(liveCutoff())} OR s."endedAt" IS NOT NULL)`);
  return Prisma.join(c, ' AND ');
}

/** WHERE for analytics_events e LEFT JOIN users u. Status has no meaning for a single event. */
function eventWhere(f) {
  const c = [Prisma.sql`e."createdAt" >= ${ts(f.from)}`, Prisma.sql`e."createdAt" <= ${ts(f.to)}`];
  if (f.audience === 'guest') c.push(Prisma.sql`e."userId" IS NULL`);
  if (f.audience === 'member') c.push(Prisma.sql`e."userId" IS NOT NULL`);
  if (f.userId) c.push(Prisma.sql`e."userId" = ${f.userId}`);
  if (f.q) c.push(Prisma.sql`(u.name ILIKE ${like(f.q)} OR u.email ILIKE ${like(f.q)} OR e.email ILIKE ${like(f.q)})`);
  if (f.country) c.push(Prisma.sql`e.country = ${f.country}`);
  if (f.ip) c.push(Prisma.sql`e.ip LIKE ${`${f.ip.replace(/[\\%_]/g, '\\$&')}%`}`);
  if (f.device) c.push(Prisma.sql`e.device = ${f.device}`);
  if (f.browser) c.push(Prisma.sql`e.browser = ${f.browser}`);
  return Prisma.join(c, ' AND ');
}

/** Fill the gaps a GROUP BY leaves, so a quiet day is a zero and not a missing point. */
function fillBuckets(rows, f, fields) {
  const trunc = (d) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    if (f.granularity === 'week') x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    if (f.granularity === 'month') x.setUTCDate(1);
    return x;
  };
  const byKey = new Map(rows.map((r) => [new Date(r.bucket).toISOString(), r]));
  const out = [];
  const step = (d) => {
    const x = new Date(d);
    if (f.granularity === 'month') x.setUTCMonth(x.getUTCMonth() + 1);
    else x.setUTCDate(x.getUTCDate() + (f.granularity === 'week' ? 7 : 1));
    return x;
  };
  for (let d = trunc(f.from), n = 0; d <= f.to && n < 400; d = step(d), n += 1) {
    const hit = byKey.get(d.toISOString());
    const point = { bucket: d.toISOString() };
    fields.forEach((k) => { point[k] = hit ? num(hit[k]) : 0; });
    out.push(point);
  }
  return out;
}

const who = (row, role) => ({
  userId: row.userId || null,
  name: row.userName || null,
  email: row.userEmail || null,
  kind: row.userId ? 'MEMBER' : 'GUEST',
  ip: maskIp(row.ip, role),
});

// ── Overview ──────────────────────────────────

async function overview(f) {
  const where = sessionWhere(f);
  const cutoff = liveCutoff();

  const [kpi] = await prisma.$queryRaw`
    SELECT COUNT(*) AS sessions,
           COUNT(DISTINCT s."visitorId") AS visitors,
           COALESCE(SUM(s."pageViews"), 0) AS "pageViews",
           COUNT(*) FILTER (WHERE s."landingPath" = '/') AS "landingVisits",
           COUNT(*) FILTER (WHERE s."pageViews" <= 1) AS bounces,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))), 0) AS "avgSeconds"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where}`;

  // New = a visitor whose very first session (ever, not just in the window)
  // falls inside it; everyone else in the window is returning.
  const [vis] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE fs."firstSeen" >= ${ts(f.from)}) AS "newVisitors",
           COUNT(*) FILTER (WHERE fs."firstSeen" <  ${ts(f.from)}) AS "returningVisitors"
    FROM (SELECT DISTINCT s."visitorId" FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId" WHERE ${where}) v
    JOIN LATERAL (SELECT MIN("startedAt") AS "firstSeen" FROM analytics_sessions WHERE "visitorId" = v."visitorId") fs ON true`;

  const [live] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE "userId" IS NULL) AS guests,
           COUNT(*) FILTER (WHERE "userId" IS NOT NULL) AS members
    FROM analytics_sessions WHERE "lastSeenAt" > ${ts(cutoff)} AND "endedAt" IS NULL`;

  const [ev] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE e.type = 'REGISTER') AS registrations,
           COUNT(*) FILTER (WHERE e.type = 'LOGIN_SUCCESS') AS logins,
           COUNT(*) FILTER (WHERE e.type = 'LOGIN_FAILED') AS "failedLogins",
           COUNT(*) FILTER (WHERE e.type = 'LOGOUT') AS logouts
    FROM analytics_events e LEFT JOIN users u ON u.id = e."userId"
    WHERE ${eventWhere(f)}`;

  const [active] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "userId") FILTER (WHERE "lastSeenAt" >= ${ts(new Date(Date.now() - DAY))}) AS dau,
           COUNT(DISTINCT "userId") FILTER (WHERE "lastSeenAt" >= ${ts(new Date(Date.now() - 7 * DAY))}) AS wau,
           COUNT(DISTINCT "userId") AS mau
    FROM analytics_sessions WHERE "userId" IS NOT NULL AND "lastSeenAt" >= ${ts(new Date(Date.now() - 30 * DAY))}`;

  const totalUsers = await prisma.user.count({ where: { role: 'MEMBER', deletedAt: null } });

  const trunc = Prisma.raw(`'${f.granularity}'`); // whitelisted by parseFilters
  const series = await prisma.$queryRaw`
    SELECT date_trunc(${trunc}, s."startedAt") AS bucket,
           COUNT(DISTINCT s."visitorId") AS visitors,
           COUNT(DISTINCT s."userId") AS users,
           COALESCE(SUM(s."pageViews"), 0) AS "pageViews"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s."startedAt" >= ${ts(f.from)}
    GROUP BY 1 ORDER BY 1`;

  const sessions = num(kpi.sessions);
  const visitors = num(kpi.visitors);
  return {
    live: { guests: num(live.guests), members: num(live.members), total: num(live.guests) + num(live.members) },
    kpis: {
      sessions, visitors,
      pageViews: num(kpi.pageViews),
      landingVisits: num(kpi.landingVisits),
      newVisitors: num(vis.newVisitors),
      returningVisitors: num(vis.returningVisitors),
      registrations: num(ev.registrations),
      totalRegisteredUsers: totalUsers,
      avgSessionSeconds: Math.round(num(kpi.avgSeconds)),
      bounceRate: pct(num(kpi.bounces), sessions),
      // Visitors who went on to apply, over all visitors in the window.
      conversionRate: pct(num(ev.registrations), visitors),
    },
    activeUsers: { daily: num(active.dau), weekly: num(active.wau), monthly: num(active.mau) },
    auth: { logins: num(ev.logins), failedLogins: num(ev.failedLogins), registrations: num(ev.registrations), logouts: num(ev.logouts) },
    series: fillBuckets(series, f, ['visitors', 'users', 'pageViews']),
  };
}

// ── Live ──────────────────────────────────────

const SESSION_COLUMNS = Prisma.sql`
  s.id, s."visitorId", s."userId", s.ip, s.country, s.city, s.device, s.browser, s.os,
  s.source, s."landingPath", s."currentPath", s."pageViews", s."loggedInAt",
  s."startedAt", s."lastSeenAt", s."endedAt", u.name AS "userName", u.email AS "userEmail"`;

function sessionRow(r, role, now = Date.now()) {
  const live = !r.endedAt && now - new Date(r.lastSeenAt).getTime() <= LIVE_WINDOW_MS;
  return {
    id: r.id, ...who(r, role),
    country: r.country, countryName: countryName(r.country), city: r.city,
    device: r.device, browser: r.browser, os: r.os, source: r.source,
    landingPath: r.landingPath, currentPath: r.currentPath, pageViews: r.pageViews,
    loggedInAt: r.loggedInAt, startedAt: r.startedAt, lastSeenAt: r.lastSeenAt, endedAt: r.endedAt,
    status: live ? 'LIVE' : 'ENDED',
    durationSeconds: Math.max(0, Math.round((new Date(r.endedAt || r.lastSeenAt) - new Date(r.startedAt)) / 1000)),
  };
}

/** The live board, UNMASKED - `present()` masks per viewer, so one query serves every admin. */
async function liveRaw(f = {}) {
  // The window and the status are NOT the caller's to set: "live" is now, not
  // a date range, and a caller's default status of 'all' must not widen it.
  const where = sessionWhere({
    audience: 'all', ...f, from: new Date(0), to: new Date(Date.now() + DAY), status: 'live',
  });
  const rows = await prisma.$queryRaw`
    SELECT ${SESSION_COLUMNS} FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} ORDER BY s."lastSeenAt" DESC LIMIT 200`;
  const [counts] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE "userId" IS NULL) AS guests, COUNT(*) FILTER (WHERE "userId" IS NOT NULL) AS members
    FROM analytics_sessions WHERE "lastSeenAt" > ${ts(liveCutoff())} AND "endedAt" IS NULL`;
  return { rows, counts: { guests: num(counts.guests), members: num(counts.members) }, at: new Date().toISOString() };
}

function presentLive(raw, role) {
  const now = Date.now();
  const byCountry = {};
  raw.rows.forEach((r) => { const k = countryName(r.country); byCountry[k] = (byCountry[k] || 0) + 1; });
  return {
    at: raw.at,
    counts: { ...raw.counts, total: raw.counts.guests + raw.counts.members },
    topCountries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, count]) => ({ country, count })),
    sessions: raw.rows.map((r) => sessionRow(r, role, now)),
    truncated: raw.counts.guests + raw.counts.members > raw.rows.length,
  };
}

// ── Sessions (history + search) ───────────────

async function sessions(f, { page = 1, limit = 25 }, role) {
  const where = sessionWhere(f);
  const take = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * take;
  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw`
      SELECT ${SESSION_COLUMNS} FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
      WHERE ${where} ORDER BY s."startedAt" DESC LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw`SELECT COUNT(*) AS total FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId" WHERE ${where}`,
  ]);
  return { sessions: rows.map((r) => sessionRow(r, role)), pagination: { page, limit: take, total: num(total) } };
}

// ── Landing page ──────────────────────────────

async function landing(f) {
  const where = sessionWhere(f);
  const [totals] = await prisma.$queryRaw`
    SELECT COUNT(*) AS visits, COUNT(DISTINCT s."visitorId") AS visitors,
           COUNT(*) FILTER (WHERE s."pageViews" <= 1) AS bounces,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))), 0) AS "avgSeconds"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s."landingPath" = '/'`;
  // Landing visitors who then applied or signed in - the page's job.
  const [conv] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT s."visitorId") FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e."visitorId" = s."visitorId" AND e.type = 'REGISTER' AND e."createdAt" >= s."startedAt")) AS applied,
           COUNT(DISTINCT s."visitorId") FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e."visitorId" = s."visitorId" AND e.type = 'LOGIN_SUCCESS' AND e."createdAt" >= s."startedAt")) AS "signedIn"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s."landingPath" = '/'`;
  const trunc = Prisma.raw(`'${f.granularity}'`);
  const series = await prisma.$queryRaw`
    SELECT date_trunc(${trunc}, s."startedAt") AS bucket, COUNT(*) AS visits, COUNT(DISTINCT s."visitorId") AS visitors
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s."landingPath" = '/' AND s."startedAt" >= ${ts(f.from)} GROUP BY 1 ORDER BY 1`;
  const sources = await prisma.$queryRaw`
    SELECT COALESCE(s.source, 'Direct') AS source, COUNT(*) AS visits
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s."landingPath" = '/' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
  const visits = num(totals.visits);
  return {
    visits, visitors: num(totals.visitors),
    bounceRate: pct(num(totals.bounces), visits),
    avgSessionSeconds: Math.round(num(totals.avgSeconds)),
    applied: num(conv.applied), signedIn: num(conv.signedIn),
    applyRate: pct(num(conv.applied), num(totals.visitors)),
    series: fillBuckets(series, f, ['visits', 'visitors']),
    sources: sources.map((r) => ({ source: r.source, visits: num(r.visits) })),
  };
}

// ── Geography ─────────────────────────────────

async function geo(f) {
  const where = sessionWhere(f);
  const countries = await prisma.$queryRaw`
    SELECT s.country, COUNT(DISTINCT s."visitorId") AS visitors, COUNT(*) AS sessions, COUNT(DISTINCT s."userId") AS members
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} GROUP BY s.country ORDER BY 2 DESC, 3 DESC LIMIT 60`;
  const cities = await prisma.$queryRaw`
    SELECT s.country, s.city, COUNT(DISTINCT s."visitorId") AS visitors, COUNT(*) AS sessions
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} AND s.city IS NOT NULL GROUP BY s.country, s.city ORDER BY 3 DESC, 4 DESC LIMIT 60`;
  return {
    countries: countries.map((r) => ({ code: r.country, country: countryName(r.country), visitors: num(r.visitors), sessions: num(r.sessions), members: num(r.members) })),
    cities: cities.map((r) => ({ code: r.country, country: countryName(r.country), city: r.city, visitors: num(r.visitors), sessions: num(r.sessions) })),
  };
}

// ── Login & registration ──────────────────────

const AUTH_TYPES = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'REGISTER'];

async function authEvents(f, { page = 1, limit = 25, type }, role) {
  const where = sessionless(f, type);
  const take = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * take;
  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw`
      SELECT e.id, e.type, e."userId", e.email, e.ip, e.country, e.city, e.device, e.browser, e."createdAt",
             u.name AS "userName", u.email AS "userEmail"
      FROM analytics_events e LEFT JOIN users u ON u.id = e."userId"
      WHERE ${where} ORDER BY e."createdAt" DESC LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw`SELECT COUNT(*) AS total FROM analytics_events e LEFT JOIN users u ON u.id = e."userId" WHERE ${where}`,
  ]);
  return {
    events: rows.map((r) => ({
      id: r.id, type: r.type, createdAt: r.createdAt,
      userId: r.userId, name: r.userName, email: r.userEmail || r.email,
      ip: maskIp(r.ip, role), country: r.country, countryName: countryName(r.country), city: r.city,
      device: r.device, browser: r.browser,
    })),
    pagination: { page, limit: take, total: num(total) },
  };
}

function sessionless(f, type) {
  const base = eventWhere(f);
  const types = type && AUTH_TYPES.includes(type) ? [type] : AUTH_TYPES;
  return Prisma.sql`${base} AND e.type IN (${Prisma.join(types)})`;
}

async function authSummary(f) {
  const trunc = Prisma.raw(`'${f.granularity}'`);
  const where = sessionless(f);
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${trunc}, e."createdAt") AS bucket,
           COUNT(*) FILTER (WHERE e.type = 'LOGIN_SUCCESS') AS logins,
           COUNT(*) FILTER (WHERE e.type = 'LOGIN_FAILED') AS failed,
           COUNT(*) FILTER (WHERE e.type = 'REGISTER') AS registrations,
           COUNT(*) FILTER (WHERE e.type = 'LOGOUT') AS logouts
    FROM analytics_events e LEFT JOIN users u ON u.id = e."userId" WHERE ${where} GROUP BY 1 ORDER BY 1`;
  const [t] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE e.type = 'LOGIN_SUCCESS') AS logins,
           COUNT(*) FILTER (WHERE e.type = 'LOGIN_FAILED') AS failed,
           COUNT(*) FILTER (WHERE e.type = 'REGISTER') AS registrations,
           COUNT(*) FILTER (WHERE e.type = 'LOGOUT') AS logouts
    FROM analytics_events e LEFT JOIN users u ON u.id = e."userId" WHERE ${where}`;
  const attempts = num(t.logins) + num(t.failed);
  return {
    totals: { logins: num(t.logins), failedLogins: num(t.failed), registrations: num(t.registrations), logouts: num(t.logouts), failureRate: pct(num(t.failed), attempts) },
    series: fillBuckets(rows, f, ['logins', 'failed', 'registrations', 'logouts']),
  };
}

// ── Traffic & engagement ──────────────────────

async function traffic(f) {
  const sWhere = sessionWhere(f);
  const eWhere = eventWhere(f);
  const pages = await prisma.$queryRaw`
    SELECT e.path, COUNT(*) AS views, COUNT(DISTINCT e."visitorId") AS visitors
    FROM analytics_events e LEFT JOIN users u ON u.id = e."userId"
    WHERE ${eWhere} AND e.type = 'PAGE_VIEW' AND e.path IS NOT NULL GROUP BY e.path ORDER BY 2 DESC LIMIT 25`;
  const sources = await prisma.$queryRaw`
    SELECT COALESCE(s.source, 'Direct') AS source, COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))), 0) AS "avgSeconds"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId" WHERE ${sWhere} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
  const devices = await prisma.$queryRaw`
    SELECT COALESCE(s.device, 'Unknown') AS name, COUNT(*) AS sessions FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${sWhere} GROUP BY 1 ORDER BY 2 DESC`;
  const browsers = await prisma.$queryRaw`
    SELECT COALESCE(s.browser, 'Unknown') AS name, COUNT(*) AS sessions FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${sWhere} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
  const [t] = await prisma.$queryRaw`
    SELECT COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))), 0) AS "avgSeconds",
           COALESCE(AVG(s."pageViews"), 0) AS "pagesPerSession",
           COUNT(*) FILTER (WHERE s."pageViews" <= 1) AS bounces
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId" WHERE ${sWhere}`;
  const [c] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE e.type = 'REGISTER') AS applied, COUNT(*) FILTER (WHERE e.type = 'LOGIN_SUCCESS') AS logins
    FROM analytics_events e LEFT JOIN users u ON u.id = e."userId" WHERE ${eWhere}`;
  const sessionsTotal = num(t.sessions);
  return {
    totals: {
      sessions: sessionsTotal, visitors: num(t.visitors),
      avgSessionSeconds: Math.round(num(t.avgSeconds)),
      pagesPerSession: Math.round(num(t.pagesPerSession) * 10) / 10,
      bounceRate: pct(num(t.bounces), sessionsTotal),
      applyRate: pct(num(c.applied), num(t.visitors)),
      loginRate: pct(num(c.logins), sessionsTotal),
    },
    pages: pages.map((r) => ({ path: r.path, views: num(r.views), visitors: num(r.visitors) })),
    sources: sources.map((r) => ({ source: r.source, sessions: num(r.sessions), visitors: num(r.visitors), avgSessionSeconds: Math.round(num(r.avgSeconds)) })),
    devices: devices.map((r) => ({ name: r.name, sessions: num(r.sessions) })),
    browsers: browsers.map((r) => ({ name: r.name, sessions: num(r.sessions) })),
  };
}

// ── One member's history ──────────────────────

async function userHistory(userId, f, role) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
  if (!user) return null;
  const scope = { ...f, userId, from: new Date(0), to: new Date(Date.now() + DAY), status: 'all', audience: 'all', q: null, country: null, ip: null, device: null, browser: null };
  const where = sessionWhere(scope);
  const [sum] = await prisma.$queryRaw`
    SELECT COUNT(*) AS sessions, COALESCE(SUM(s."pageViews"), 0) AS "pageViews",
           COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(s."endedAt", s."lastSeenAt") - s."startedAt"))), 0) AS "totalSeconds",
           COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(s."endedAt", s."lastSeenAt") - s."startedAt"))), 0) AS "avgSeconds",
           MAX(s."lastSeenAt") AS "lastActivity", MIN(s."startedAt") AS "firstSeen"
    FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId" WHERE ${where}`;
  const rows = await prisma.$queryRaw`
    SELECT ${SESSION_COLUMNS} FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
    WHERE ${where} ORDER BY s."startedAt" DESC LIMIT 50`;
  const events = await prisma.$queryRaw`
    SELECT e.id, e.type, e.path, e.ip, e.country, e.city, e.device, e.browser, e."createdAt"
    FROM analytics_events e WHERE e."userId" = ${userId} ORDER BY e."createdAt" DESC LIMIT 200`;
  const [logins] = await prisma.$queryRaw`
    SELECT COUNT(*) FILTER (WHERE type = 'LOGIN_SUCCESS') AS ok FROM analytics_events WHERE "userId" = ${userId}`;
  return {
    user,
    summary: {
      sessions: num(sum.sessions), pageViews: num(sum.pageViews), logins: num(logins.ok),
      totalSeconds: Math.round(num(sum.totalSeconds)), avgSessionSeconds: Math.round(num(sum.avgSeconds)),
      lastActivity: sum.lastActivity, firstSeen: sum.firstSeen,
    },
    sessions: rows.map((r) => sessionRow(r, role)),
    events: events.map((r) => ({
      id: r.id, type: r.type, path: r.path, createdAt: r.createdAt,
      ip: maskIp(r.ip, role), countryName: countryName(r.country), city: r.city, device: r.device, browser: r.browser,
    })),
  };
}

/** Picker for "whose history?" - name or email, five characters of nothing is not a search. */
async function findUsers(q) {
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  return prisma.user.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }] },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' }, take: 10,
  });
}

/** Distinct values the filter dropdowns offer, from what has actually been recorded. */
async function filterOptions() {
  const [countries, devices, browsers] = await Promise.all([
    prisma.$queryRaw`SELECT country, COUNT(*) AS n FROM analytics_sessions WHERE country IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 100`,
    prisma.$queryRaw`SELECT DISTINCT device FROM analytics_sessions WHERE device IS NOT NULL ORDER BY 1`,
    prisma.$queryRaw`SELECT browser, COUNT(*) AS n FROM analytics_sessions WHERE browser IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
  ]);
  return {
    countries: countries.map((r) => ({ code: r.country, name: countryName(r.country) })),
    devices: devices.map((r) => r.device),
    browsers: browsers.map((r) => r.browser),
  };
}

// ── CSV export ────────────────────────────────

const REPORTS = ['sessions', 'auth', 'pages', 'geo'];

/** A spreadsheet runs a cell that starts with = + - @ as a formula; a leading quote makes it text. */
function cell(v) {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (header, rows) =>
  // BOM so Excel opens it as UTF-8 and city names with accents survive.
  `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

async function exportReport(report, f, role) {
  if (report === 'sessions') {
    const rows = await prisma.$queryRaw`
      SELECT ${SESSION_COLUMNS} FROM analytics_sessions s LEFT JOIN users u ON u.id = s."userId"
      WHERE ${sessionWhere(f)} ORDER BY s."startedAt" DESC LIMIT ${MAX_EXPORT_ROWS}`;
    return toCsv(
      ['Session', 'Type', 'Name', 'Email', 'IP', 'Country', 'City', 'Device', 'Browser', 'OS', 'Source', 'Landing page', 'Current page', 'Page views', 'Logged in at', 'Started', 'Last activity', 'Duration (s)', 'Status'],
      rows.map((r) => { const s = sessionRow(r, role); return [s.id, s.kind, s.name, s.email, s.ip, s.countryName, s.city, s.device, s.browser, s.os, s.source, s.landingPath, s.currentPath, s.pageViews, s.loggedInAt, s.startedAt, s.lastSeenAt, s.durationSeconds, s.status]; }),
    );
  }
  if (report === 'auth') {
    const rows = await prisma.$queryRaw`
      SELECT e.type, e.email, e.ip, e.country, e.city, e.device, e.browser, e."createdAt", u.name AS "userName", u.email AS "userEmail"
      FROM analytics_events e LEFT JOIN users u ON u.id = e."userId"
      WHERE ${sessionless(f)} ORDER BY e."createdAt" DESC LIMIT ${MAX_EXPORT_ROWS}`;
    return toCsv(['Time', 'Event', 'Name', 'Email', 'IP', 'Country', 'City', 'Device', 'Browser'],
      rows.map((r) => [r.createdAt, r.type, r.userName, r.userEmail || r.email, maskIp(r.ip, role), countryName(r.country), r.city, r.device, r.browser]));
  }
  if (report === 'pages') {
    const t = await traffic(f);
    return toCsv(['Page', 'Views', 'Unique visitors'], t.pages.map((p) => [p.path, p.views, p.visitors]));
  }
  const g = await geo(f);
  return toCsv(['Country', 'City', 'Visitors', 'Sessions'], [
    ...g.countries.map((c) => [c.country, '', c.visitors, c.sessions]),
    ...g.cities.map((c) => [c.country, c.city, c.visitors, c.sessions]),
  ]);
}

module.exports = {
  parseFilters, overview, liveRaw, presentLive, sessions, landing, geo, authEvents, authSummary,
  traffic, userHistory, findUsers, filterOptions, exportReport,
  RANGES, GRANULARITIES, AUTH_TYPES, REPORTS, MAX_EXPORT_ROWS, maskIp, cell,
};
