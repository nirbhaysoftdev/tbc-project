// tests/apiKeys.test.js
//
// Machine access: what a key can reach, what it is shown, who may issue one,
// and that rotation and revocation behave the way the panel promises.
//
// Same terms as the other suites - the real routers over real HTTP, so the
// gates under test are the ones that ship. The assertions that matter most are
// the negative ones: a key without `events:sensitive` must not be able to
// obtain an IBAN, a passport path or the text of a member's enquiry by any
// route, and a key issued for one scope must not reach another.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const apiKeys = require('../src/services/apiKeys');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

const suffix = crypto.randomBytes(5).toString('hex');
const tag = (name) => `tbckey-${suffix}-${name}`;
const created = { users: [], projects: [], keys: [] };

let server;
let baseUrl;
let admin;       // ADMIN - may read the feed, may NOT manage keys
let superAdmin;  // SUPER_ADMIN - may manage keys
let member;      // the subject of the fixture events
let project;

const tokenFor = (user) => jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function call(method, path, { user, key, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {}),
      ...(key ? { 'X-API-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed };
}

/** A key with the given scopes, torn down afterwards. */
async function issue(scopes, { name = tag('key'), expiresInDays } = {}) {
  const { key, apiKey } = await apiKeys.createApiKey({ name, scopes, expiresInDays, createdById: superAdmin.id });
  created.keys.push(apiKey.id);
  return { key, apiKey };
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  // Mounted in the same order as index.js, because that order is what makes
  // the key path reachable at all: routes/admin.js gates its entire router,
  // so the feed has to be mounted ahead of it.
  app.use('/api/admin', require('../src/routes/adminEvents'));
  app.use('/api/admin', require('../src/routes/admin'));
  app.use('/api/super-admin', require('../src/routes/superAdmin'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const makeUser = async ({ name, role = 'MEMBER', status = 'ACTIVE', profile }) => {
    const user = await prisma.user.create({
      data: {
        name: `Key ${name}`,
        email: `${tag(name)}@example.test`,
        role, status, emailVerified: true, accountType: 'PROFESSIONAL',
        ...(profile ? { profile: { create: profile } } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    created.users.push(user.id);
    return user;
  };

  admin = await makeUser({ name: 'admin', role: 'ADMIN' });
  superAdmin = await makeUser({ name: 'super', role: 'SUPER_ADMIN' });
  member = await makeUser({
    name: 'member',
    profile: {
      phone: '501112222',
      passportUrl: '/uploads/signup/secret-passport.png',
      billingAddress: '12 Private Road',
      vatNumber: 'VAT-0001',
    },
  });

  project = await prisma.project.create({
    data: {
      ownerId: admin.id,
      title: tag('project'),
      description: 'Subject of the enquiry under test.',
      category: 'REAL_ESTATE',
      targetAmount: 100000,
      fundingDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  });
  created.projects.push(project.id);

  // One of each kind, so redaction is tested against a real payload of every
  // shape rather than only the one that happens to be newest.
  await prisma.withdrawRequest.create({
    data: {
      userId: member.id,
      firstName: 'Key', lastName: 'Member', companyName: tag('co'),
      bankName: 'Test Bank', iban: 'AE999331234567890123456', swiftNumber: 'SECRETAD',
      address: '12 Private Road', amount: 3000, reason: tag('private-reason'),
    },
  });
  await prisma.enquiry.create({
    data: {
      memberId: member.id,
      projectId: project.id,
      subjectName: project.title,
      message: `${tag('secret-message')} - confidential text a key must not read.`,
      recipientEmail: 'ops@example.test',
      status: 'SENT',
      sentAt: new Date(),
    },
  });
});

test.after(async () => {
  if (created.keys.length) await prisma.apiKey.deleteMany({ where: { id: { in: created.keys } } });
  if (created.projects.length) {
    await prisma.enquiry.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  }
  if (created.users.length) {
    await prisma.enquiry.deleteMany({ where: { memberId: { in: created.users } } });
    await prisma.withdrawRequest.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.apiKey.deleteMany({ where: { createdById: { in: created.users } } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

const feedForMember = (extra = '') => `/api/admin/events?memberId=${member.id}&limit=100${extra}`;

// ─── Generating and storing ──────────────────────────────────────────────────

test('a generated key is prefixed, long, and stored only as a digest', async () => {
  const { key, apiKey } = await issue(['events:read']);

  assert.ok(key.startsWith('tbc_live_'));
  assert.ok(key.length > 40, 'carries 256 bits of entropy');
  assert.equal(apiKey.keyPrefix, key.slice(0, 16));

  const row = await prisma.apiKey.findUnique({ where: { id: apiKey.id } });
  // The row must not contain the key in any column.
  assert.ok(!JSON.stringify(row).includes(key), 'the plaintext key is nowhere in the row');
  assert.equal(row.keyHash, crypto.createHash('sha256').update(key).digest('hex'));

  // And two keys are never the same.
  const second = await issue(['events:read']);
  assert.notEqual(second.key, key);
});

test('the key is returned once and by nothing else afterwards', async () => {
  const res = await call('POST', '/api/super-admin/api-keys', {
    user: superAdmin,
    body: { name: tag('once'), scopes: ['events:read'] },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.key.startsWith('tbc_live_'));
  created.keys.push(res.body.apiKey.id);

  const list = await call('GET', '/api/super-admin/api-keys', { user: superAdmin });
  assert.equal(list.status, 200);
  const listed = list.body.keys.find((k) => k.id === res.body.apiKey.id);
  assert.ok(listed, 'the key is listed');
  assert.equal(listed.key, undefined, 'but never with the secret');
  assert.equal(listed.keyHash, undefined, 'and not with the digest either');
  assert.ok(!JSON.stringify(list.body).includes(res.body.key));
});

test('an unknown scope is refused rather than silently dropped', async () => {
  const res = await call('POST', '/api/super-admin/api-keys', {
    user: superAdmin,
    body: { name: tag('bad'), scopes: ['events:read', 'events:everything'] },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /events:everything/);

  const none = await call('POST', '/api/super-admin/api-keys', {
    user: superAdmin, body: { name: tag('empty'), scopes: [] },
  });
  assert.equal(none.status, 400);
});

// ─── Who may issue one ───────────────────────────────────────────────────────

test('issuing and revoking keys is super admin only', async () => {
  const { apiKey } = await issue(['events:read']);

  for (const [method, path] of [
    ['GET', '/api/super-admin/api-keys'],
    ['POST', '/api/super-admin/api-keys'],
    ['PUT', `/api/super-admin/api-keys/${apiKey.id}`],
    ['POST', `/api/super-admin/api-keys/${apiKey.id}/rotate`],
    ['DELETE', `/api/super-admin/api-keys/${apiKey.id}`],
  ]) {
    const res = await call(method, path, {
      user: admin,
      ...(method === 'GET' ? {} : { body: { name: 'x', scopes: ['events:read'] } }),
    });
    assert.equal(res.status, 403, `${method} ${path} refuses a plain ADMIN`);
  }
});

test('a key cannot be used to manage keys, or to reach any other admin route', async () => {
  const { key } = await issue(['events:read', 'events:sensitive']);

  assert.equal((await call('GET', '/api/super-admin/api-keys', { key })).status, 401);
  assert.equal((await call('POST', '/api/super-admin/api-keys', { key, body: { name: 'x', scopes: ['events:read'] } })).status, 401);
  // The feed is the only thing a key reaches. /admin/members keeps its own
  // session gate and does not know what an API key is.
  assert.equal((await call('GET', '/api/admin/members', { key })).status, 401);
  assert.equal((await call('GET', '/api/admin/logs', { key })).status, 401);
});

// ─── Scopes ──────────────────────────────────────────────────────────────────

test('a scope is required for the route it covers', async () => {
  const counts = await issue(['events:counts']);
  const read = await issue(['events:read']);

  // counts-only cannot read the feed...
  const refused = await call('GET', '/api/admin/events', { key: counts.key });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /events:read/);
  assert.deepEqual(refused.body.scopes, ['events:counts']);

  // ...but can count.
  assert.equal((await call('GET', '/api/admin/events/counts', { key: counts.key })).status, 200);
  // And a feed key may certainly count, without being granted both.
  assert.equal((await call('GET', '/api/admin/events/counts', { key: read.key })).status, 200);
});

test('a key in the query string is refused, not honoured', async () => {
  const { key } = await issue(['events:read']);
  const res = await call('GET', `/api/admin/events?api_key=${encodeURIComponent(key)}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /X-API-Key header/);
});

// ─── Redaction ───────────────────────────────────────────────────────────────

test('without events:sensitive a key cannot obtain identifying detail', async () => {
  const { key } = await issue(['events:read']);
  const res = await call('GET', feedForMember(), { key });
  assert.equal(res.status, 200);
  assert.equal(res.body.redacted, true);

  const body = JSON.stringify(res.body);
  // The specific secrets in the fixtures, by value: whatever the projection
  // grows next, none of these may appear.
  for (const secret of [
    member.email,
    '501112222',                        // phone
    '/uploads/signup/secret-passport.png',
    'AE999331234567890123456',          // IBAN
    'SECRETAD',                         // SWIFT
    '12 Private Road',                  // address
    'VAT-0001',
    tag('secret-message'),              // the enquiry text
    tag('private-reason'),              // the withdrawal reason
  ]) {
    assert.ok(!body.includes(secret), `redacted payload must not contain ${secret}`);
  }

  // What it does get: enough to count and to chart.
  const withdrawal = res.body.events.find((e) => e.kind === 'WITHDRAWAL');
  assert.equal(withdrawal.amount, 3000);
  assert.equal(withdrawal.detail.bankName, 'Test Bank');
  assert.equal(withdrawal.detail.iban, undefined);
  assert.equal(withdrawal.detail.accountHolder, undefined);

  const signup = res.body.events.find((e) => e.kind === 'SIGNUP');
  assert.equal(signup.member.name, member.name);
  assert.equal(signup.member.email, undefined);
  // Document presence, never the path.
  assert.equal(signup.detail.documents.passport, true);
  assert.equal(signup.detail.documents.passportUrl, undefined);

  const enquiry = res.body.events.find((e) => e.kind === 'ENQUIRY');
  assert.equal(enquiry.detail.subjectName, project.title);
  assert.equal(enquiry.detail.message, undefined);
  assert.ok(enquiry.detail.messageLength > 0, 'how much they wrote, not what');
});

test('with events:sensitive the key gets what an admin session gets', async () => {
  const { key } = await issue(['events:read', 'events:sensitive']);
  const viaKey = await call('GET', feedForMember(), { key });
  const viaSession = await call('GET', feedForMember(), { user: admin });

  assert.equal(viaKey.body.redacted, false);
  assert.equal(viaSession.body.redacted, false);

  const keyWithdrawal = viaKey.body.events.find((e) => e.kind === 'WITHDRAWAL');
  assert.equal(keyWithdrawal.detail.iban, 'AE999331234567890123456');
  assert.equal(keyWithdrawal.detail.swiftNumber, 'SECRETAD');

  const keySignup = viaKey.body.events.find((e) => e.kind === 'SIGNUP');
  assert.equal(keySignup.detail.documents.passportUrl, '/uploads/signup/secret-passport.png');
  assert.equal(keySignup.member.email, member.email);

  // The two paths agree, so a dashboard built against a key is not a
  // second, divergent shape.
  assert.deepEqual(
    viaKey.body.events.map((e) => e.id),
    viaSession.body.events.map((e) => e.id),
  );
});

test('an admin session is never redacted, with no scope involved', async () => {
  const res = await call('GET', feedForMember(), { user: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.redacted, false);
  assert.equal(res.body.key, undefined, 'no key was used');
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

test('a revoked key stops working, and the row stays as the record', async () => {
  const { key, apiKey } = await issue(['events:read']);
  assert.equal((await call('GET', '/api/admin/events', { key })).status, 200);

  const revoked = await call('DELETE', `/api/super-admin/api-keys/${apiKey.id}`, { user: superAdmin });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.apiKey.status, 'REVOKED');

  assert.equal((await call('GET', '/api/admin/events', { key })).status, 401);

  const row = await prisma.apiKey.findUnique({ where: { id: apiKey.id } });
  assert.ok(row, 'revocation is a timestamp, not a delete');
  assert.ok(row.revokedAt);
  assert.equal(row.revokedById, superAdmin.id);

  // Revoking twice does not move the timestamp - the first one is when it
  // actually stopped working.
  const again = await call('DELETE', `/api/super-admin/api-keys/${apiKey.id}`, { user: superAdmin });
  assert.equal(again.status, 200);
  assert.equal(new Date(again.body.apiKey.revokedAt).getTime(), row.revokedAt.getTime());
});

test('an expired key stops working without anyone revoking it', async () => {
  const { key, apiKey } = await issue(['events:read']);
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data:  { expiresAt: new Date(Date.now() - 1000) },
  });

  assert.equal((await call('GET', '/api/admin/events', { key })).status, 401);
  const list = await call('GET', '/api/super-admin/api-keys', { user: superAdmin });
  assert.equal(list.body.keys.find((k) => k.id === apiKey.id).status, 'EXPIRED');
});

test('rotation is additive: both keys work until the old one is revoked', async () => {
  const original = await issue(['events:read', 'events:sensitive'], { name: tag('rotating') });

  const rotated = await call('POST', `/api/super-admin/api-keys/${original.apiKey.id}/rotate`, { user: superAdmin });
  assert.equal(rotated.status, 201);
  created.keys.push(rotated.body.apiKey.id);

  const fresh = rotated.body.key;
  assert.notEqual(fresh, original.key);
  // Same name and scopes, so the consumer's access does not change.
  assert.equal(rotated.body.apiKey.name, original.apiKey.name);
  assert.deepEqual(rotated.body.apiKey.scopes, original.apiKey.scopes);
  assert.equal(rotated.body.apiKey.rotatedFromId, original.apiKey.id);

  // The window that makes rotation safe: both work.
  assert.equal((await call('GET', '/api/admin/events', { key: original.key })).status, 200);
  assert.equal((await call('GET', '/api/admin/events', { key: fresh })).status, 200);

  await call('DELETE', `/api/super-admin/api-keys/${original.apiKey.id}`, { user: superAdmin });
  assert.equal((await call('GET', '/api/admin/events', { key: original.key })).status, 401);
  assert.equal((await call('GET', '/api/admin/events', { key: fresh })).status, 200);
});

test('scopes can be changed on a live key without reissuing it', async () => {
  const { key, apiKey } = await issue(['events:read']);
  assert.equal((await call('GET', feedForMember(), { key })).body.redacted, true);

  const updated = await call('PUT', `/api/super-admin/api-keys/${apiKey.id}`, {
    user: superAdmin,
    body: { scopes: ['events:read', 'events:sensitive'], name: tag('renamed') },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body.apiKey.scopes, ['events:read', 'events:sensitive']);

  // Same key string, more access - and the other direction works too.
  assert.equal((await call('GET', feedForMember(), { key })).body.redacted, false);

  await call('PUT', `/api/super-admin/api-keys/${apiKey.id}`, {
    user: superAdmin, body: { scopes: ['events:counts'] },
  });
  assert.equal((await call('GET', '/api/admin/events', { key })).status, 403);
});

test('using a key records that it was used', async () => {
  const { key, apiKey } = await issue(['events:read']);
  assert.equal((await prisma.apiKey.findUnique({ where: { id: apiKey.id } })).lastUsedAt, null);

  await call('GET', '/api/admin/events', { key });
  // `touch` is fire-and-forget, so give it a moment to land.
  await new Promise((resolve) => setTimeout(resolve, 150));

  const row = await prisma.apiKey.findUnique({ where: { id: apiKey.id } });
  assert.ok(row.lastUsedAt, 'last used is recorded, so an unused key can be revoked with confidence');
  assert.ok(row.lastUsedIp);
});

test('every key action is written to the activity log', async () => {
  const res = await call('POST', '/api/super-admin/api-keys', {
    user: superAdmin, body: { name: tag('logged'), scopes: ['events:read'] },
  });
  created.keys.push(res.body.apiKey.id);
  await call('DELETE', `/api/super-admin/api-keys/${res.body.apiKey.id}`, { user: superAdmin });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const logs = await prisma.activityLog.findMany({
    where: { actorId: superAdmin.id, type: { in: ['API_KEY_CREATED', 'API_KEY_REVOKED'] } },
  });
  assert.ok(logs.some((l) => l.type === 'API_KEY_CREATED'));
  assert.ok(logs.some((l) => l.type === 'API_KEY_REVOKED'));
  // The log is read by the whole admin team, so it must not contain a live
  // credential - only the prefix that identifies which key it was.
  assert.ok(!JSON.stringify(logs).includes(res.body.key));
  assert.ok(JSON.stringify(logs).includes(res.body.apiKey.keyPrefix));
});
