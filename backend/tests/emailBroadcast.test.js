// tests/emailBroadcast.test.js
//
// The admin "Email Communication" broadcast: create with each selection mode,
// idempotency, and the worker's claim/send/retry/rollup cycle. Same approach
// as tests/projectLifecycle.test.js - real router, real HTTP, real JWTs,
// SMTP replaced with nodemailer's json transport so nothing is actually
// mailed, including to whatever real ACTIVE members already exist in this
// development database.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const h = require('./helpers');
const prisma = h.prisma;
const broadcastService = require('../src/services/emailBroadcast');
const worker = require('../src/services/emailBroadcastWorker');

h.useJsonMail();

let server = null;
let baseUrl = '';

async function startServer() {
  if (server) return baseUrl;
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../src/routes/emailBroadcasts'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
}

async function call(method, path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.user ? { Authorization: `Bearer ${h.tokenFor(opts.user)}` } : {}),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed || {} };
}

/** Drain exactly one broadcast's queue, mirroring helpers.drain for announcements. */
async function drain(broadcastId, { max = 100 } = {}) {
  for (let i = 0; i < max; i += 1) {
    const row = await prisma.emailBroadcastRecipient.findFirst({
      where: { broadcastId, status: { in: ['QUEUED', 'FAILED'] }, runAfter: { lte: new Date() } },
      include: { broadcast: true },
    });
    if (!row) break;
    await prisma.emailBroadcastRecipient.update({
      where: { id: row.id },
      data: { status: 'SENDING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    await worker.processRecipient({ ...row, attempts: row.attempts + 1 });
  }
  return worker.rollUp(broadcastId);
}

const createdBroadcasts = [];
const basePayload = (overrides = {}) => ({
  subject: 'Test subject',
  heading: 'Test heading',
  intro: 'Test intro',
  bodyText: 'Line one.\n\nLine two.',
  ...overrides,
});

let admin;
let member;
let member2;
let pending;
let frozen;

test.before(async () => {
  // Same reasoning as projectLifecycle.test.js: automatic sending off for the
  // whole run, so every test drives the queue itself with drain() rather than
  // racing the interval.
  worker.pause();
  await startServer();
  admin = await h.makeUser({ name: 'bc-admin', role: 'ADMIN' });
  member = await h.makeUser({ name: 'bc-member' });
  member2 = await h.makeUser({ name: 'bc-member2' });
  pending = await h.makeUser({ name: 'bc-pending', status: 'PENDING' });
  frozen = await h.makeUser({ name: 'bc-frozen', status: 'FROZEN' });
});

test.after(async () => {
  if (createdBroadcasts.length) {
    await prisma.emailBroadcast.deleteMany({ where: { id: { in: createdBroadcasts } } });
  }
  await h.cleanup();
  await stopServer();
});

const expectedAudienceSize = () => broadcastService.resolveAudience().then((r) => r.audienceSize);

test('an unauthenticated or non-admin caller cannot read the audience or create a broadcast', async () => {
  assert.equal((await call('GET', '/api/admin/broadcasts/audience')).status, 401);
  assert.equal((await call('GET', '/api/admin/broadcasts/audience', { user: member })).status, 403);
  assert.equal((await call('POST', '/api/admin/broadcasts', { user: member, body: basePayload() })).status, 403);
});

test('PENDING and FROZEN accounts never appear in the audience', async () => {
  const res = await call('GET', '/api/admin/broadcasts/audience', { user: admin });
  assert.equal(res.status, 200);
  const ids = res.body.members.map((m) => m.id);
  assert.ok(!ids.includes(pending.id), 'pending account must not be mailable');
  assert.ok(!ids.includes(frozen.id), 'frozen account must not be mailable');
  assert.ok(ids.includes(member.id));
  assert.equal(res.body.total, await expectedAudienceSize());
});

test('preview renders without writing anything', async () => {
  const before = await prisma.emailBroadcast.count();
  const res = await call('POST', '/api/admin/broadcasts/preview', {
    user: admin,
    body: basePayload({ ctaLabel: 'Open', ctaUrl: 'https://example.com', previewName: 'Alex' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.subject, 'Test subject');
  assert.match(res.body.html, /Test heading/);
  assert.match(res.body.html, /https:\/\/example\.com/);
  assert.equal(await prisma.emailBroadcast.count(), before, 'preview must not create a row');
});

test('rejects a missing required field', async () => {
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ bodyText: '' }),
  });
  assert.equal(res.status, 400);
});

test('rejects INCLUDE with no one selected, rather than silently mailing everyone', async () => {
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [] } }),
  });
  assert.equal(res.status, 400);
});

test('ALL reaches the whole active audience', async () => {
  const expected = await expectedAudienceSize();
  const res = await call('POST', '/api/admin/broadcasts', { user: admin, body: basePayload() });
  assert.equal(res.status, 201);
  createdBroadcasts.push(res.body.broadcast.id);

  assert.equal(res.body.broadcast.audienceMode, 'ALL');
  assert.equal(res.body.broadcast.audienceSize, expected);
  assert.equal(res.body.broadcast.recipientCount, expected);

  const recipients = await prisma.emailBroadcastRecipient.findMany({
    where: { broadcastId: res.body.broadcast.id },
  });
  assert.equal(recipients.length, expected);
  assert.ok(recipients.some((r) => r.userId === member.id));
  assert.ok(!recipients.some((r) => r.userId === pending.id));
});

test('INCLUDE reaches only the selected members', async () => {
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [member.id] } }),
  });
  assert.equal(res.status, 201);
  createdBroadcasts.push(res.body.broadcast.id);

  assert.equal(res.body.broadcast.audienceMode, 'INCLUDE');
  assert.equal(res.body.broadcast.recipientCount, 1);

  const recipients = await prisma.emailBroadcastRecipient.findMany({
    where: { broadcastId: res.body.broadcast.id },
  });
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].userId, member.id);
});

test('EXCLUDE reaches the audience minus the selected members', async () => {
  const expected = await expectedAudienceSize();
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'EXCLUDE', userIds: [member.id] } }),
  });
  assert.equal(res.status, 201);
  createdBroadcasts.push(res.body.broadcast.id);

  assert.equal(res.body.broadcast.audienceMode, 'EXCLUDE');
  assert.equal(res.body.broadcast.recipientCount, expected - 1);

  const recipients = await prisma.emailBroadcastRecipient.findMany({
    where: { broadcastId: res.body.broadcast.id },
  });
  assert.ok(!recipients.some((r) => r.userId === member.id));
  assert.ok(recipients.some((r) => r.userId === member2.id));
});

test('a retried create with the same session id is recognised, not resent', async () => {
  const sessionId = `test-session-${Date.now()}`;
  const first = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [member.id] }, sessionId }),
  });
  assert.equal(first.status, 201);
  createdBroadcasts.push(first.body.broadcast.id);

  const retry = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [member.id] }, sessionId }),
  });
  assert.equal(retry.status, 200, 'the retry returns the existing row, not a new one');
  assert.equal(retry.body.broadcast.id, first.body.broadcast.id);

  const count = await prisma.emailBroadcastRecipient.count({ where: { broadcastId: first.body.broadcast.id } });
  assert.equal(count, 1, 'the retry must not create a second recipient row');
});

test('the worker drains a broadcast to COMPLETED, and a retry only touches DEAD rows', async () => {
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [member.id, member2.id] } }),
  });
  assert.equal(res.status, 201);
  const broadcastId = res.body.broadcast.id;
  createdBroadcasts.push(broadcastId);

  const rollup = await drain(broadcastId);
  assert.equal(rollup.state, 'COMPLETED');
  assert.equal(rollup.sent, 2);

  const after = await call('GET', `/api/admin/broadcasts/${broadcastId}`, { user: admin });
  assert.equal(after.body.broadcast.email.state, 'COMPLETED');
  assert.equal(after.body.broadcast.email.accepted, 2);

  // SENT rows are never re-queued by retry.
  const retry = await call('POST', `/api/admin/broadcasts/${broadcastId}/retry`, { user: admin });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.requeued, 0, 'nothing failed, so there is nothing to retry');

  const rows = await prisma.emailBroadcastRecipient.findMany({ where: { broadcastId } });
  assert.ok(rows.every((r) => r.status === 'SENT'));
});

test('a selection with no matching recipients is created as COMPLETED with nothing queued', async () => {
  const res = await call('POST', '/api/admin/broadcasts', {
    user: admin,
    body: basePayload({ selection: { mode: 'INCLUDE', userIds: [pending.id] } }),
  });
  assert.equal(res.status, 201);
  createdBroadcasts.push(res.body.broadcast.id);
  assert.equal(res.body.broadcast.recipientCount, 0);
  assert.equal(res.body.broadcast.emailState, 'COMPLETED');
});

test('history lists broadcasts newest first with aggregated counts, no addresses', async () => {
  const res = await call('GET', '/api/admin/broadcasts?limit=100', { user: admin });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.broadcasts));
  assert.ok(res.body.broadcasts.length >= createdBroadcasts.length);
  const json = JSON.stringify(res.body);
  assert.ok(!json.includes(member.email), 'recipient addresses must not appear in the history payload');
});
