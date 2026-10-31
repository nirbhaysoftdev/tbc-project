// tests/trafficMonitor.test.js
//
// Analytics & Monitoring: who may read it, that it is read-only, that a beat
// becomes a live session, and that the privacy rules hold (Do-Not-Track, IP
// masking for ADMIN, impersonation not counted, export cells that cannot run
// as formulas). Real router, real HTTP, real JWTs, real database; everything
// created is deleted again, by the random suffix its ids carry.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const tracker = require('../src/services/trafficTracker');
const analytics = require('../src/services/trafficAnalytics');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

const suffix = crypto.randomBytes(5).toString('hex');
const id = (n) => `tm${suffix}${n}`;
const created = { users: [] };
let server; let baseUrl; let admin; let superAdmin; let member;

const tokenFor = (u, extra = {}) => jwt.sign({ userId: u.id, ...extra }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function api(method, path, { user, body, headers = {}, token } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user || token ? { Authorization: `Bearer ${token || tokenFor(user)}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, text };
}

const beat = (n, extra = {}, opts = {}) => api('POST', '/api/track', {
  body: { sessionId: id(`s${n}`), visitorId: id(`v${n}`), kind: 'view', path: '/', ...extra },
  headers: { 'X-Forwarded-For': '203.0.113.77', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', ...opts.headers },
  ...opts,
});
// recordBeat is fire-and-forget behind a 204, so give it a moment to land.
const settle = () => new Promise((r) => setTimeout(r, 400));

async function makeUser(name, role) {
  const u = await prisma.user.create({
    data: { name: `Test ${name}`, email: `${suffix}-${name}@example.test`, role, status: 'ACTIVE', emailVerified: true },
    select: { id: true, name: true, email: true, role: true },
  });
  created.users.push(u.id);
  return u;
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/track', require('../src/routes/track'));
  app.use('/api/admin', require('../src/routes/adminMonitoring'));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  admin = await makeUser('admin', 'ADMIN');
  superAdmin = await makeUser('super', 'SUPER_ADMIN');
  member = await makeUser('member', 'MEMBER');
});

test.after(async () => {
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  await prisma.analyticsEvent.deleteMany({ where: { OR: [{ visitorId: { startsWith: `tm${suffix}` } }, { userId: { in: created.users } }] } });
  await prisma.analyticsSession.deleteMany({ where: { visitorId: { startsWith: `tm${suffix}` } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

test('access: signed out 401, member 403, admin and super admin 200', async () => {
  assert.equal((await api('GET', '/api/admin/monitoring/overview')).status, 401);
  assert.equal((await api('GET', '/api/admin/monitoring/overview', { user: member })).status, 403);
  assert.equal((await api('GET', '/api/admin/monitoring/overview', { user: admin })).status, 200);
  assert.equal((await api('GET', '/api/admin/monitoring/overview', { user: superAdmin })).status, 200);
});

test('access: an impersonated admin session is refused', async () => {
  const token = tokenFor(admin, { impersonatedBy: superAdmin.id });
  assert.equal((await api('GET', '/api/admin/monitoring/overview', { token })).status, 403);
});

test('read-only: every write method is refused, for an admin too', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await api(method, '/api/admin/monitoring/overview', { user: superAdmin, body: {} });
    assert.equal(r.status, 405, `${method} must be 405`);
  }
});

test('a page beat becomes a live guest session, with device and browser parsed', async () => {
  assert.equal((await beat(1)).status, 204);
  await settle();
  const live = await api('GET', '/api/admin/monitoring/live', { user: superAdmin });
  const s = live.body.sessions.find((x) => x.id === id('s1'));
  assert.ok(s, 'session is on the live board');
  assert.equal(s.kind, 'GUEST');
  assert.equal(s.status, 'LIVE');
  assert.equal(s.device, 'Mobile');
  assert.equal(s.landingPath, '/');
});

test('a query string never reaches the database', async () => {
  await beat(2, { path: '/reset-password?token=SECRET#frag' });
  await settle();
  const row = await prisma.analyticsSession.findUnique({ where: { id: id('s2') } });
  assert.equal(row.landingPath, '/reset-password');
});

test('Do-Not-Track and Global Privacy Control are not recorded', async () => {
  await beat(3, {}, { headers: { DNT: '1' } });
  await beat(4, {}, { headers: { 'Sec-GPC': '1' } });
  await settle();
  assert.equal(await prisma.analyticsSession.count({ where: { id: { in: [id('s3'), id('s4')] } } }), 0);
});

test('a beat carrying a valid token attaches the member; guests stay separate', async () => {
  await beat(5, { path: '/dashboard' }, { token: tokenFor(member) });
  await settle();
  const live = await api('GET', '/api/admin/monitoring/live', { user: superAdmin });
  const s = live.body.sessions.find((x) => x.id === id('s5'));
  assert.equal(s.kind, 'MEMBER');
  assert.equal(s.email, member.email);
  assert.equal(s.name, member.name);
  const guest = live.body.sessions.find((x) => x.id === id('s1'));
  assert.equal(guest.kind, 'GUEST');
  const members = await api('GET', '/api/admin/monitoring/sessions?audience=member&q=' + encodeURIComponent(member.email), { user: admin });
  assert.ok(members.body.sessions.some((x) => x.id === id('s5')));
  assert.ok(!members.body.sessions.some((x) => x.id === id('s1')));
});

test('impersonation is not counted as the member being active', async () => {
  await beat(6, {}, { token: tokenFor(member, { impersonatedBy: superAdmin.id }) });
  await settle();
  assert.equal(await prisma.analyticsSession.count({ where: { id: id('s6') } }), 0);
});

test('a session id that belongs to another visitor cannot be written to', async () => {
  await api('POST', '/api/track', { body: { sessionId: id('s1'), visitorId: id('vOther'), kind: 'view', path: '/hijack' } });
  await settle();
  const row = await prisma.analyticsSession.findUnique({ where: { id: id('s1') } });
  assert.equal(row.currentPath, '/');
});

test('the browser reporting "end" takes the session off the live board', async () => {
  await beat(7);
  await settle();
  await beat(7, { kind: 'end' });
  await settle();
  const live = await api('GET', '/api/admin/monitoring/live', { user: admin });
  assert.ok(!live.body.sessions.some((x) => x.id === id('s7')));
});

test('IP is masked for an ADMIN and whole for a SUPER_ADMIN', async () => {
  const q = '/api/admin/monitoring/sessions?limit=100&range=today';
  const asAdmin = (await api('GET', q, { user: admin })).body.sessions.find((x) => x.id === id('s1'));
  const asSuper = (await api('GET', q, { user: superAdmin })).body.sessions.find((x) => x.id === id('s1'));
  assert.equal(asSuper.ip, '203.0.113.77');
  assert.equal(asAdmin.ip, '203.0.113.x');
  assert.ok(!JSON.stringify(asAdmin).includes('203.0.113.77'));
});

test('an ADMIN may not search on the hidden part of an address; a SUPER_ADMIN may', async () => {
  assert.equal((await api('GET', '/api/admin/monitoring/sessions?ip=203.0.113.77', { user: admin })).status, 400);
  assert.equal((await api('GET', '/api/admin/monitoring/sessions?ip=203.0.113', { user: admin })).status, 200);
  const r = await api('GET', '/api/admin/monitoring/sessions?ip=203.0.113.77', { user: superAdmin });
  assert.equal(r.status, 200);
  assert.ok(r.body.sessions.some((x) => x.id === id('s1')));
});

test('auth events: a failed login is recorded with the address tried', async () => {
  await tracker.recordAuth({ headers: { 'x-forwarded-for': '198.51.100.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'x-analytics-visitor': id('v8') }, socket: {} },
    { type: 'LOGIN_FAILED', email: `Nobody-${suffix}@Example.test` });
  const r = await api('GET', `/api/admin/monitoring/auth?type=LOGIN_FAILED&q=nobody-${suffix}`, { user: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.events.length, 1);
  assert.equal(r.body.events[0].email, `nobody-${suffix}@example.test`);
  assert.ok(r.body.totals.failedLogins >= 1);
  await prisma.analyticsEvent.deleteMany({ where: { email: `nobody-${suffix}@example.test` } });
});

test('overview: counts the visits it was given and reports live guests and members', async () => {
  const r = await api('GET', '/api/admin/monitoring/overview?range=today', { user: admin });
  assert.equal(r.status, 200);
  assert.ok(r.body.kpis.sessions >= 2);
  assert.ok(r.body.live.members >= 1 && r.body.live.guests >= 1);
  assert.ok(Array.isArray(r.body.series) && r.body.series.length >= 1);
  assert.ok(r.body.kpis.totalRegisteredUsers >= 1);
});

test('filters: bad ranges are a 400, and a custom range is bounded', async () => {
  assert.equal((await api('GET', '/api/admin/monitoring/overview?range=custom&from=nope&to=2026-01-01', { user: admin })).status, 400);
  assert.equal((await api('GET', '/api/admin/monitoring/overview?range=custom&from=2020-01-01&to=2026-01-01', { user: admin })).status, 400);
  assert.equal((await api('GET', '/api/admin/monitoring/overview?range=custom&from=2026-02-01&to=2026-01-01', { user: admin })).status, 400);
});

test('user history: the member, their session and a masked address', async () => {
  const r = await api('GET', `/api/admin/monitoring/users/${member.id}`, { user: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, member.email);
  assert.ok(r.body.summary.sessions >= 1);
  assert.ok(r.body.events.every((e) => !e.ip || e.ip.endsWith('.x')));
  assert.equal((await api('GET', '/api/admin/monitoring/users/00000000-0000-0000-0000-000000000000', { user: admin })).status, 404);
});

test('export: CSV for admins, audited, with formula-looking cells defused', async () => {
  const r = await api('GET', '/api/admin/monitoring/export?report=sessions&range=today', { user: admin });
  assert.equal(r.status, 200);
  assert.ok(r.text.startsWith('Session,Type,Name'));
  assert.ok(!r.text.includes('203.0.113.77'), 'an admin export carries the masked address');
  assert.equal(analytics.cell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(analytics.cell('+1'), "'+1");
  assert.equal((await api('GET', '/api/admin/monitoring/export?report=bogus', { user: admin })).status, 400);
  assert.equal((await api('GET', '/api/admin/monitoring/export?report=sessions', { user: member })).status, 403);
  await new Promise((r2) => setTimeout(r2, 300));
  const log = await prisma.activityLog.findFirst({ where: { type: 'DATA_EXPORTED', actorId: admin.id } });
  assert.ok(log, 'the export is in the activity log');
  await prisma.activityLog.deleteMany({ where: { actorId: { in: created.users } } });
});

test('live stream: delivers a frame, and refuses a member', async () => {
  assert.equal((await api('GET', '/api/admin/monitoring/live/stream', { user: member })).status, 403);
  const ctl = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/monitoring/live/stream`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` }, signal: ctl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('event: live')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += Buffer.from(value).toString();
  }
  ctl.abort();
  assert.ok(text.includes('event: live'));
  const payload = JSON.parse(text.split('data: ')[1].split('\n')[0]);
  assert.ok(payload.counts.total >= 1);
});
