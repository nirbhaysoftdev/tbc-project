// tests/helpers.js
//
// Fixtures for the project-lifecycle tests.
//
// WHAT THESE TESTS ARE. They drive the REAL Express router over real HTTP with
// real JWTs against the real database. That is deliberate: almost everything
// this feature has to get right is a property of the route gate, the Prisma
// transaction, the unique indexes and the enum columns, and a test that mocked
// those would be testing the mock. "An unauthorized user cannot launch the
// project" in particular is meaningless unless the request actually passes
// through `authenticate` and `requireAdmin`.
//
// WHY THERE IS NO TEST RUNNER DEPENDENCY. Node 18+ ships `node:test`, so the
// suite adds nothing to package.json. `npm test` runs it.
//
// WHAT IT DOES TO THE DATABASE. Every fixture is namespaced with a random
// suffix and torn down in `cleanup()`, including the activity-log rows the
// actions write, so a run leaves the development data exactly as it found it.
// It needs a reachable database; it does not need, and never contacts, an SMTP
// server - see `useJsonMail`.
require('dotenv').config();

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../src/utils/prismaClient');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

/**
 * Render every email instead of sending it.
 *
 * This is the real mailer and the real templates - nodemailer's jsonTransport
 * only replaces the socket. So the assertions below about what is in the
 * announcement email are assertions about the email the portal would actually
 * send, not about a stub.
 */
function useJsonMail() {
  process.env.SMTP_TRANSPORT = 'json';
}

const suffix = crypto.randomBytes(5).toString('hex');
const tag = (name) => `tbctest-${suffix}-${name}`;
const testEmail = (name) => `${tag(name)}@example.test`;

/** Everything created, so teardown is exact rather than a wildcard DELETE. */
const created = { users: [], projects: [] };

// Fixture projects get distinct titles, so a test can identify its own project
// by name rather than matching thirteen of them.
let projectSeq = 0;

async function makeUser({ name, role = 'MEMBER', status = 'ACTIVE' }) {
  const user = await prisma.user.create({
    data: {
      name: `Test ${name}`,
      email: testEmail(name),
      role,
      status,
      emailVerified: true,
    },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  created.users.push(user.id);
  return user;
}

async function makeProject({ ownerId, status = 'DRAFT', launchState, ...rest }) {
  const project = await prisma.project.create({
    data: {
      ownerId,
      title: `${tag('project')}-${++projectSeq}`,
      description: 'A project created by the lifecycle test suite.',
      category: 'REAL_ESTATE',
      targetAmount: 100000,
      valuation: 400000,
      fundingDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status,
      ...(launchState ? { launchState } : {}),
      ...rest,
    },
  });
  created.projects.push(project.id);
  return project;
}

const tokenFor = (user) => jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * The projects router on an ephemeral port, mounted exactly as index.js mounts
 * it, so the route gates under test are the ones that ship.
 */
let server = null;
let baseUrl = '';

async function startServer() {
  if (server) return baseUrl;
  const app = express();
  app.use(express.json());
  app.use('/api/projects', require('../src/routes/projects'));
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

/** One authenticated request. Returns { status, body }. */
async function call(method, path, { user, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed || {} };
}

const getProject = (id) => prisma.project.findUnique({ where: { id } });

const announcementsFor = (projectId) => prisma.projectAnnouncement.findMany({
  where: { projectId },
  orderBy: { createdAt: 'asc' },
  include: { recipients: true },
});

/**
 * Send one announcement's queue to completion, and roll it up.
 *
 * Scoped to ONE announcement on purpose. `worker.tick()` claims the oldest 20
 * rows in the whole queue, so in a suite that has launched a dozen projects it
 * would spend its batch on somebody else's announcement and the assertion
 * under test would be about rows that were never touched.
 *
 * It claims exactly as the worker does - flip to SENDING and increment
 * `attempts` first, then send - because `processRecipient` is written on the
 * assumption that the claim already counted the attempt, and a drain that
 * skipped it would make the retry-exhaustion tests measure the wrong number.
 */
async function drain(announcementId, { max = 100 } = {}) {
  const worker = require('../src/services/announcementWorker');
  for (let i = 0; i < max; i += 1) {
    const row = await prisma.projectAnnouncementRecipient.findFirst({
      where: {
        announcementId,
        status: { in: ['QUEUED', 'FAILED'] },
        runAfter: { lte: new Date() },
      },
      include: { announcement: { include: { project: true } } },
    });
    if (!row) break;
    await prisma.projectAnnouncementRecipient.update({
      where: { id: row.id },
      data: { status: 'SENDING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    await worker.processRecipient({ ...row, attempts: row.attempts + 1 }, { bannerPath: null });
  }
  return worker.rollUp(announcementId);
}

/**
 * Remove every row the run created.
 *
 * Order matters: projects cascade their announcements and recipients, posts
 * and notifications cascade from their author, and the activity log only
 * nulls its actor - so the log rows are deleted explicitly rather than left
 * behind to clutter the admin Logs page with test runs.
 */
async function cleanup() {
  // Announcement notifications are written for every ACTIVE member in the
  // database - including the real ones a developer machine already has - and
  // they are linked to the project by a value inside `data`, not by a foreign
  // key, so nothing cascades them. Cleared explicitly, or a test run would
  // leave real members holding notifications for projects that no longer
  // exist. One statement per project because a JSON-path filter cannot take a
  // list.
  for (const projectId of created.projects) {
    await prisma.notification.deleteMany({
      where: {
        type: { in: ['PROJECT_LAUNCHED', 'PROJECT_UPDATE'] },
        data: { path: ['projectId'], equals: projectId },
      },
    });
  }
  if (created.projects.length) {
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  }
  if (created.users.length) {
    await prisma.activityLog.deleteMany({ where: { actorId: { in: created.users } } });
    await prisma.post.deleteMany({ where: { authorId: { in: created.users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  created.projects.length = 0;
  created.users.length = 0;
}

module.exports = {
  useJsonMail,
  tag,
  testEmail,
  makeUser,
  makeProject,
  tokenFor,
  startServer,
  stopServer,
  call,
  getProject,
  announcementsFor,
  drain,
  cleanup,
  prisma,
};
