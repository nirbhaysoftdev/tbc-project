// tests/eventFeed.test.js
//
// The admin event feed: who may read it, what each of the three kinds reports,
// and the two properties a poller depends on - that `since` is exclusive and
// that `latestAt` is the newest event in the set rather than on the page.
//
// Like tests/projectLifecycle.test.js, this drives the REAL router over real
// HTTP with real JWTs against the development database. The gate on this feed
// is the whole point of it - every event carries somebody's bank details,
// identity-document paths or private message - so "a member gets 403" is only
// worth asserting if the request actually passes through `authenticate` and
// `requireAdmin`.
//
// It has its own fixtures rather than reusing tests/helpers.js, whose server
// mounts the projects router and memoises it.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const feed = require('../src/services/eventFeed');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

const suffix = crypto.randomBytes(5).toString('hex');
const tag = (name) => `tbcevt-${suffix}-${name}`;
const created = { users: [], projects: [], companies: [] };

let server;
let baseUrl;
let admin;      // ADMIN - may read the feed
let superAdmin; // SUPER_ADMIN - may too
let member;     // ACTIVE MEMBER - may not
let applicant;  // the PENDING signup under test
let project;

const tokenFor = (user) => jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function call(path, { user } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: user ? { Authorization: `Bearer ${tokenFor(user)}` } : {},
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

async function makeUser({ name, role = 'MEMBER', status = 'ACTIVE', profile, createdAt }) {
  const user = await prisma.user.create({
    data: {
      name: `Evt ${name}`,
      email: `${tag(name)}@example.test`,
      role,
      status,
      emailVerified: true,
      accountType: 'PROFESSIONAL',
      ...(createdAt ? { createdAt } : {}),
      ...(profile ? { profile: { create: profile } } : {}),
    },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  created.users.push(user.id);
  return user;
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../src/routes/adminEvents'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  admin = await makeUser({ name: 'admin', role: 'ADMIN' });
  superAdmin = await makeUser({ name: 'super', role: 'SUPER_ADMIN' });
  member = await makeUser({ name: 'member' });

  applicant = await makeUser({
    name: 'applicant',
    status: 'PENDING',
    profile: {
      company: tag('co'),
      city: 'Dubai',
      country: 'AE',
      phone: '501234567',
      phoneDialCode: '+971',
      passportUrl: '/uploads/signup/passport-under-test.png',
      tradeLicenseUrl: '/uploads/signup/licence-under-test.png',
    },
  });
  // What the signup endpoint writes, and what `detail.source` is derived from.
  await prisma.adminLog.create({
    data: { adminId: applicant.id, action: 'SELF_REGISTER', details: { email: applicant.email } },
  });

  project = await prisma.project.create({
    data: {
      ownerId: admin.id,
      title: tag('project'),
      description: 'Subject of the enquiry under test.',
      category: 'REAL_ESTATE',
      targetAmount: 250000,
      raisedAmount: 50000,
      fundingDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  });
  created.projects.push(project.id);
});

test.after(async () => {
  if (created.projects.length) {
    await prisma.enquiry.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  }
  if (created.users.length) {
    await prisma.enquiry.deleteMany({ where: { memberId: { in: created.users } } });
    await prisma.withdrawRequest.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.adminLog.deleteMany({ where: { adminId: { in: created.users } } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

/** Fixture events, created in a known order so the feed's ordering is testable. */
async function makeWithdrawal({ amount = 2500, status = 'PENDING', userId = member.id } = {}) {
  return prisma.withdrawRequest.create({
    data: {
      userId,
      firstName: 'Evt', lastName: 'Member',
      companyName: tag('bankco'),
      bankName: 'Test Bank', iban: 'AE070331234567890123456', swiftNumber: 'TESTAEAD',
      address: '1 Test Street',
      amount, reason: tag('reason'), status,
    },
  });
}

async function makeEnquiry({ status = 'SENT', memberId = member.id } = {}) {
  return prisma.enquiry.create({
    data: {
      memberId,
      projectId: project.id,
      subjectName: project.title,
      message: `${tag('msg')} - please get in touch about this project.`,
      recipientEmail: 'ops@example.test, ops2@example.test',
      status,
      ...(status === 'SENT' ? { sentAt: new Date() } : {}),
    },
  });
}

/** Only the events this run created, whatever else the database holds. */
const mine = (events) => events.filter((e) => (
  created.users.includes(e.member.id)
));

// ─── The gate ────────────────────────────────────────────────────────────────

test('a member cannot read the event feed, and neither can an anonymous caller', async () => {
  for (const path of ['/api/admin/events', '/api/admin/events/counts']) {
    assert.equal((await call(path, { user: member })).status, 403);
    assert.equal((await call(path)).status, 401);
  }
});

test('both admin tiers can read it', async () => {
  for (const user of [admin, superAdmin]) {
    const res = await call('/api/admin/events', { user });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.kinds, ['SIGNUP', 'WITHDRAWAL', 'ENQUIRY']);
  }
});

// ─── The three kinds ─────────────────────────────────────────────────────────

test('a signup event carries the applicant details and the CURRENT status', async () => {
  const res = await call(`/api/admin/events?kind=SIGNUP&memberId=${applicant.id}`, { user: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.events.length, 1);

  const event = res.body.events[0];
  assert.equal(event.kind, 'SIGNUP');
  assert.equal(event.id, `signup:${applicant.id}`);
  assert.equal(event.member.email, applicant.email);
  assert.equal(event.status, 'PENDING');
  assert.equal(event.needsAttention, true);
  assert.equal(event.amount, null);
  assert.equal(event.detail.kycStatus, 'NOT_SUBMITTED');
  assert.equal(event.detail.walletEnabled, false);
  assert.equal(event.detail.source, 'SELF');
  assert.equal(event.detail.signupMethod, 'email');
  assert.equal(event.detail.city, 'Dubai');
  assert.equal(event.detail.phoneDialCode, '+971');
  assert.equal(event.detail.documents.passportUrl, '/uploads/signup/passport-under-test.png');

  // The live status, not the status at signup: approve the applicant and the
  // same event reports ACTIVE. This is the whole reason the feed reads the
  // source table instead of the activity log.
  await prisma.user.update({ where: { id: applicant.id }, data: { status: 'ACTIVE' } });
  const after = await call(`/api/admin/events?kind=SIGNUP&memberId=${applicant.id}`, { user: admin });
  assert.equal(after.body.events[0].status, 'ACTIVE');
  assert.equal(after.body.events[0].needsAttention, false);
  await prisma.user.update({ where: { id: applicant.id }, data: { status: 'PENDING' } });
});

test('a withdrawal event carries the member and the amount', async () => {
  const request = await makeWithdrawal({ amount: 1750.5 });

  const res = await call(`/api/admin/events?kind=WITHDRAWAL&memberId=${member.id}`, { user: admin });
  assert.equal(res.status, 200);

  const event = res.body.events.find((e) => e.id === `withdrawal:${request.id}`);
  assert.ok(event, 'the request is in the feed');
  assert.equal(event.member.id, member.id);
  assert.equal(event.amount, 1750.5);
  assert.equal(event.status, 'PENDING');
  assert.equal(event.needsAttention, true);
  assert.equal(event.detail.bankName, 'Test Bank');
  assert.equal(event.detail.iban, 'AE070331234567890123456');
  assert.equal(event.detail.accountHolder, 'Evt Member');
  assert.equal(event.detail.decidedAt, null);
});

test('an enquiry event carries the member, the subject and its figures', async () => {
  const enquiry = await makeEnquiry();

  const res = await call(`/api/admin/events?kind=ENQUIRY&memberId=${member.id}`, { user: admin });
  assert.equal(res.status, 200);

  const event = res.body.events.find((e) => e.id === `enquiry:${enquiry.id}`);
  assert.ok(event, 'the enquiry is in the feed');
  assert.equal(event.member.id, member.id);
  assert.equal(event.detail.target, 'PROJECT');
  assert.equal(event.detail.subjectName, project.title);
  assert.equal(event.detail.subject.id, project.id);
  assert.equal(event.detail.subject.targetAmount, 250000);
  assert.equal(event.detail.subject.raisedAmount, 50000);
  // An enquiry moves no money, so the project's target amount must not be
  // reported as an amount this member asked for.
  assert.equal(event.amount, null);
  // The recipient addresses are counted, never listed.
  assert.equal(event.detail.recipientCount, 2);
  assert.equal(event.detail.recipientEmail, undefined);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test('kind filters the feed, and an unknown kind is a 400 rather than an empty page', async () => {
  await makeWithdrawal();
  await makeEnquiry();

  const only = await call('/api/admin/events?kind=WITHDRAWAL&limit=100', { user: admin });
  assert.ok(mine(only.body.events).length > 0);
  assert.ok(only.body.events.every((e) => e.kind === 'WITHDRAWAL'));

  const bad = await call('/api/admin/events?kind=SIGNUPS', { user: admin });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Unknown event kind/);
});

test('a status is matched per kind: valid for one kind, silent for the others', async () => {
  const res = await call('/api/admin/events?status=SENT&limit=100', { user: admin });
  assert.equal(res.status, 200);
  // SENT is an enquiry status only, so the signups and withdrawals drop out
  // instead of the request failing.
  assert.ok(res.body.events.every((e) => e.kind === 'ENQUIRY'));
  assert.equal(res.body.counts.SIGNUP, 0);
  assert.equal(res.body.counts.WITHDRAWAL, 0);

  const nonsense = await call('/api/admin/events?status=BANANA', { user: admin });
  assert.equal(nonsense.status, 400);
});

test('q searches the member and the kind-specific text', async () => {
  const enquiry = await makeEnquiry();
  const res = await call(`/api/admin/events?q=${encodeURIComponent(enquiry.message.slice(0, 20))}`, { user: admin });
  assert.equal(res.status, 200);
  assert.ok(res.body.events.some((e) => e.id === `enquiry:${enquiry.id}`));
});

test('a soft-deleted member takes their events out of the feed', async () => {
  const leaver = await makeUser({ name: 'leaver' });
  const request = await makeWithdrawal({ userId: leaver.id });

  const before = await call(`/api/admin/events?memberId=${leaver.id}`, { user: admin });
  assert.ok(before.body.events.some((e) => e.id === `withdrawal:${request.id}`));

  await prisma.user.update({ where: { id: leaver.id }, data: { deletedAt: new Date() } });

  const after = await call(`/api/admin/events?memberId=${leaver.id}`, { user: admin });
  assert.equal(after.body.events.length, 0);
  assert.equal(after.body.counts.total, 0);
});

// ─── Polling ─────────────────────────────────────────────────────────────────

test('`since` is exclusive, so a poller is never handed the same event twice', async () => {
  const first = await call(`/api/admin/events?memberId=${member.id}&limit=100`, { user: admin });
  assert.ok(first.body.latestAt, 'there is a newest event to poll from');

  const quiet = await call(
    `/api/admin/events?memberId=${member.id}&since=${encodeURIComponent(first.body.latestAt)}`,
    { user: admin },
  );
  assert.equal(quiet.body.events.length, 0, 'nothing new since the last poll');
  assert.equal(quiet.body.latestAt, null, 'an empty set reports no cursor');

  const fresh = await makeWithdrawal({ amount: 99 });
  const next = await call(
    `/api/admin/events?memberId=${member.id}&since=${encodeURIComponent(first.body.latestAt)}`,
    { user: admin },
  );
  assert.deepEqual(next.body.events.map((e) => e.id), [`withdrawal:${fresh.id}`]);
});

test('`latestAt` is the newest event in the set, not the newest on the page', async () => {
  const res = await call(`/api/admin/events?memberId=${member.id}&limit=1`, { user: admin });
  assert.equal(res.body.events.length, 1);
  assert.ok(res.body.pagination.total > 1, 'the member has more events than fit on a page');
  assert.equal(new Date(res.body.latestAt).getTime(), new Date(res.body.events[0].at).getTime());

  // Page 2 is older, and its own newest event is NOT the cursor.
  const page2 = await call(`/api/admin/events?memberId=${member.id}&limit=1&page=2`, { user: admin });
  assert.ok(new Date(page2.body.events[0].at) <= new Date(res.body.latestAt));
});

test('the merged feed is one list in time order across the three tables', async () => {
  const res = await call('/api/admin/events?limit=100', { user: admin });
  const times = res.body.events.map((e) => new Date(e.at).getTime());
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(times[i - 1] >= times[i], 'newest first, across kinds');
  }
  const kinds = new Set(mine(res.body.events).map((e) => e.kind));
  assert.ok(kinds.size > 1, 'the fixtures put more than one kind in one page');
});

test('paging past the scan ceiling is refused with the way to narrow it instead', async () => {
  const res = await call(`/api/admin/events?limit=100&page=${Math.ceil(feed.MAX_SCAN / 100) + 1}`, { user: admin });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /until=/);
});

// ─── Counts ──────────────────────────────────────────────────────────────────

test('counts reports the filtered totals and what still needs an admin', async () => {
  await makeWithdrawal();                      // PENDING - needs a decision
  await makeEnquiry({ status: 'FAILED' });     // FAILED  - needs chasing

  const res = await call('/api/admin/events/counts', { user: admin });
  assert.equal(res.status, 200);
  assert.equal(
    res.body.counts.total,
    res.body.counts.SIGNUP + res.body.counts.WITHDRAWAL + res.body.counts.ENQUIRY,
  );
  assert.ok(res.body.needsAttention.SIGNUP >= 1, 'the PENDING applicant is counted');
  assert.ok(res.body.needsAttention.WITHDRAWAL >= 1);
  assert.ok(res.body.needsAttention.ENQUIRY >= 1);

  // `needsAttention` is a fact about the table, so a `since` that excludes
  // every event does not zero it - otherwise a badge would empty itself
  // between polls.
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const polled = await call(`/api/admin/events/counts?since=${encodeURIComponent(future)}`, { user: admin });
  assert.equal(polled.body.counts.total, 0);
  assert.equal(polled.body.needsAttention.total, res.body.needsAttention.total);
});
