// src/controllers/trafficMonitorController.js
//
// The admin Analytics & Monitoring module: parse filters, call the read
// service, answer. Every handler is a GET - the module has no write side, and
// the router (routes/adminMonitoring.js) refuses anything else.
const analytics = require('../services/trafficAnalytics');
const { logActivity } = require('../services/activityLog');

const filtersOr400 = (req, res) => {
  const f = analytics.parseFilters(req.query, req.user.role);
  if (f.error) { res.status(400).json({ error: f.error }); return null; }
  return f;
};

const echo = (f) => ({ range: f.range, from: f.from, to: f.to, granularity: f.granularity });

/** Wrap a handler so a DB error is a logged 500 rather than an unhandled rejection. */
const handler = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    console.error(`monitoring ${name} error:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
};

const page = (req) => ({ page: parseInt(req.query.page, 10) || 1, limit: parseInt(req.query.limit, 10) || 25 });

const getOverview = handler('overview', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json({ ...(await analytics.overview(f)), range: echo(f) });
});

const getLive = handler('live', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json(analytics.presentLive(await analytics.liveRaw(f), req.user.role));
});

const getSessions = handler('sessions', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json({ ...(await analytics.sessions(f, page(req), req.user.role)), range: echo(f) });
});

const getLanding = handler('landing', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json({ ...(await analytics.landing(f)), range: echo(f) });
});

const getGeo = handler('geo', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json({ ...(await analytics.geo(f)), range: echo(f) });
});

const getAuth = handler('auth', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  const [summary, list] = await Promise.all([
    analytics.authSummary(f),
    analytics.authEvents(f, { ...page(req), type: req.query.type }, req.user.role),
  ]);
  res.json({ ...summary, ...list, range: echo(f) });
});

const getTraffic = handler('traffic', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  res.json({ ...(await analytics.traffic(f)), range: echo(f) });
});

const getUserHistory = handler('userHistory', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  const data = await analytics.userHistory(String(req.params.id), f, req.user.role);
  if (!data) return res.status(404).json({ error: 'Member not found' });
  res.json(data);
});

const getUsers = handler('users', async (req, res) => {
  res.json({ users: await analytics.findUsers(req.query.q) });
});

const getOptions = handler('options', async (_req, res) => {
  res.json(await analytics.filterOptions());
});

const exportCsv = handler('export', async (req, res) => {
  const f = filtersOr400(req, res); if (!f) return;
  const report = String(req.query.report || 'sessions');
  if (!analytics.REPORTS.includes(report)) return res.status(400).json({ error: `Unknown report. Choose one of: ${analytics.REPORTS.join(', ')}.` });

  const csv = await analytics.exportReport(report, f, req.user.role);
  // An export is a bulk copy of visitor data, so it is on the record - who,
  // which report, which window - exactly like the member export.
  logActivity({
    type: 'DATA_EXPORTED', title: `Analytics export: ${report}`,
    actorId: req.user.id, actorName: req.user.name,
    metadata: { report, range: f.range, from: f.from, to: f.to, filters: { audience: f.audience, status: f.status, country: f.country, device: f.device, browser: f.browser, hasQuery: Boolean(f.q), hasIp: Boolean(f.ip) } },
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tbc-${report}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// ── Live stream (Server-Sent Events) ──────────
//
// One interval for ALL connected admins, running only while somebody is
// watching: the board is computed once per tick and masked per viewer, so
// twenty open tabs cost one query, not twenty. SSE rather than a WebSocket
// because the traffic is one-way and it needs no extra dependency, upgrade
// handshake or proxy configuration beyond turning buffering off.
//
// The client sends its filters when it connects; clients that share the
// default board share its query, the rest are computed individually.
const TICK_MS = 5000;
const MAX_STREAMS = 25;
const clients = new Set();
let ticker = null;

async function tick() {
  const raws = new Map();
  for (const c of clients) {
    const key = c.key;
    try {
      if (!raws.has(key)) raws.set(key, await analytics.liveRaw(c.filters));
      c.res.write(`event: live\ndata: ${JSON.stringify(analytics.presentLive(raws.get(key), c.role))}\n\n`);
    } catch (err) {
      console.error('monitoring stream tick failed:', err.message);
    }
  }
}

const streamLive = (req, res) => {
  if (clients.size >= MAX_STREAMS) return res.status(503).json({ error: 'Too many live connections. Close another tab.' });
  const f = filtersOr400(req, res); if (!f) return undefined;
  const filters = { audience: f.audience, q: f.q, country: f.country, ip: f.ip, device: f.device, browser: f.browser, userId: f.userId };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers a proxied response by default, which holds every event
    // back until the buffer fills - the board would simply never update.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  const client = { res, role: req.user.role, filters, key: JSON.stringify(filters) };
  clients.add(client);
  if (!ticker) ticker = setInterval(tick, TICK_MS);
  // First frame immediately, not after a full tick.
  analytics.liveRaw(filters)
    .then((raw) => res.write(`event: live\ndata: ${JSON.stringify(analytics.presentLive(raw, client.role))}\n\n`))
    .catch((err) => console.error('monitoring stream first frame failed:', err.message));

  req.on('close', () => {
    clients.delete(client);
    if (!clients.size && ticker) { clearInterval(ticker); ticker = null; }
  });
  return undefined;
};

module.exports = {
  getOverview, getLive, streamLive, getSessions, getLanding, getGeo, getAuth, getTraffic,
  getUserHistory, getUsers, getOptions, exportCsv,
};
