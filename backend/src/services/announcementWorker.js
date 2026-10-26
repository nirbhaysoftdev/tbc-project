// src/services/announcementWorker.js
//
// The background sender for project announcements.
//
// WHY THERE IS NO REDIS HERE, AGAIN
// This is the same decision the translation worker already made and documented
// (services/i18n/worker.js): the project has no queue, no Redis and no
// separate worker process, and the workload does not justify adding them. An
// announcement is a deliberate admin action a few times a month, so the queue
// is a Postgres table that is already backed up and already in the migration
// history, and the worker is an interval inside the API process.
//
// Using the SAME pattern twice is the point. An operator who has debugged one
// of these can debug the other, and both get the properties that actually
// matter:
//
//   * durability    - a queued email is a row, so it survives a restart. The
//                     rows are written in the launch transaction, so a crash
//                     between "launched" and "queued" is not a state that
//                     exists.
//   * safe claiming - a conditional UPDATE, so two API processes behind pm2
//                     cluster mode cannot send the same member the same
//                     announcement twice.
//   * stale locks   - a row left SENDING past the timeout is reclaimed, so a
//                     process killed mid-send does not strand a recipient.
//   * no duplicates - a row that reached SENT is never claimed again, by the
//                     worker or by the retry endpoint. Retrying a partly
//                     failed announcement mails only the people it failed for
//                     (§10).
//   * bounded retry - exponential backoff with jitter, then DEAD.
//
// The seam for a real queue later is claimBatch()/processRecipient(): a BullMQ
// worker would call the same processRecipient().
const path = require('path');
const prisma = require('../utils/prismaClient');
// Required as a module and called as `mailer.send...` rather than
// destructured. That indirection is the seam the reliability tests use to make
// a send fail on demand, which is the only way to exercise the retry, backoff
// and DEAD paths without an SMTP server that refuses mail to order.
const mailer = require('./mailer');
const { projectUrl } = require('./projectLaunch');
const mediaCtrl = require('../controllers/projectMediaController');

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const CONFIG = {
  /** How often to look for work. */
  intervalMs: Number(process.env.ANNOUNCEMENT_WORKER_INTERVAL_MS || 10000),
  /**
   * Recipients per tick. This is the throttle that keeps a 2,000-member
   * announcement from hitting the SMTP provider's rate limit in one burst:
   * 20 every 10 seconds is ~7,200/hour, under every common provider's cap.
   */
  batchSize: Number(process.env.ANNOUNCEMENT_WORKER_BATCH || 20),
  /** A row SENDING for longer than this is assumed abandoned and reclaimed. */
  staleLockMs: Number(process.env.ANNOUNCEMENT_STALE_LOCK_MS || 5 * 60 * 1000),
  /** Base for exponential backoff: 1m, 2m, 4m, 8m, 16m. */
  backoffBaseMs: Number(process.env.ANNOUNCEMENT_BACKOFF_BASE_MS || 60000),
};

let timer = null;
let running = false;
// Set by pause(). It gates the AUTOMATIC entry points - the interval and the
// kick a lifecycle action fires - and not tick() itself, so an operator or a
// test can still drain the queue deliberately while automatic sending is off.
//
// This exists for the SMTP incident: when mail is bouncing, pausing stops the
// worker burning attempts (and reputation) on every queued recipient while
// leaving every row exactly where it is, to go out when resume() is called.
let paused = false;

/**
 * Exponential backoff with jitter.
 *
 * The jitter is not decoration: without it, every recipient that failed while
 * the mail server was briefly down would retry in perfect lockstep and hit it
 * again simultaneously.
 */
function backoffFor(attempts) {
  const base = CONFIG.backoffBaseMs * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(base, 2 * 60 * 60 * 1000);
  return new Date(Date.now() + capped + Math.random() * capped * 0.25);
}

/**
 * Permanent failures. A bad address will never become good by trying again, so
 * burning five attempts and two hours on it only delays the mail for everybody
 * behind it in the queue.
 *
 * Deliberately conservative: anything not recognised here is treated as
 * temporary and retried, because wrongly giving up on a deliverable address
 * loses a message, while wrongly retrying one just costs a few attempts.
 */
function isPermanent(err) {
  const code = err?.responseCode;
  // 5xx from SMTP is a permanent rejection (550 no such user, 553 bad address).
  if (typeof code === 'number' && code >= 500 && code < 600) return true;
  return ['EENVELOPE', 'EMESSAGE'].includes(err?.code);
}

/**
 * Claim up to `limit` recipient rows for this worker.
 *
 * Two-step on purpose, matching the translation worker: find candidates, then
 * claim each with a conditional UPDATE whose WHERE still names the status it
 * must have had. If another process won the race the update affects zero rows
 * and this worker moves on. No row is ever sent twice and no lock table is
 * needed.
 */
async function claimBatch(limit = CONFIG.batchSize) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CONFIG.staleLockMs);

  const candidates = await prisma.projectAnnouncementRecipient.findMany({
    where: {
      OR: [
        // Fresh work and retries whose backoff has elapsed. Note SENT and DEAD
        // are absent: neither is ever claimed again.
        { status: { in: ['QUEUED', 'FAILED'] }, runAfter: { lte: now } },
        // Abandoned by a worker that died holding the lock.
        { status: 'SENDING', lockedAt: { lt: staleBefore } },
      ],
    },
    // Oldest announcement first, so a backlog goes out in the order the admins
    // actually created it.
    orderBy: [{ announcement: { createdAt: 'asc' } }, { id: 'asc' }],
    take: limit,
    select: { id: true, status: true },
  });

  const claimed = [];
  for (const candidate of candidates) {
    const result = await prisma.projectAnnouncementRecipient.updateMany({
      where: { id: candidate.id, status: candidate.status },
      data: {
        status: 'SENDING',
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 1) claimed.push(candidate.id);
  }

  if (!claimed.length) return [];
  return prisma.projectAnnouncementRecipient.findMany({
    where: { id: { in: claimed } },
    include: {
      announcement: {
        include: {
          project: {
            select: {
              id: true, title: true, description: true, category: true,
              location: true, launchedAt: true, bannerDocId: true,
            },
          },
        },
      },
    },
  });
}

/**
 * The banner file for a project, as an absolute path on disk, or null.
 *
 * The admin's explicit `bannerDocId` wins; otherwise the newest image, which
 * is what the project card already does. A path, not a URL — the mailer
 * attaches the bytes inline, because a ticketed stream URL is scoped to one
 * viewer and expires in an hour (see mailer.bannerAttachment).
 */
async function bannerPathFor(project) {
  try {
    const images = await prisma.projectDocument.findMany({
      where: { projectId: project.id, kind: 'IMAGE' },
      select: { id: true, fileUrl: true },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!images.length) return null;
    const chosen = images.find((d) => d.id === project.bannerDocId) || images[0];
    // basename: `fileUrl` is a bare stored filename, and forcing it through
    // basename means a doctored value can never escape the media directory.
    return path.join(mediaCtrl.MEDIA_DIR, path.basename(chosen.fileUrl));
  } catch {
    return null;
  }
}

/**
 * Send to one recipient and record the outcome.
 *
 * Exported because it is the real unit of work: the tests drive it directly,
 * and a future external queue would call exactly this.
 */
async function processRecipient(row, { bannerPath } = {}) {
  const { announcement } = row;
  const { project } = announcement;

  try {
    const info = await mailer.sendProjectAnnouncementEmail({
      kind: announcement.type,
      to: row.email,
      memberName: row.name,
      project,
      announcement,
      projectUrl: projectUrl(project.id),
      bannerPath: bannerPath === undefined ? await bannerPathFor(project) : bannerPath,
      launchedAt: project.launchedAt,
    });

    await prisma.projectAnnouncementRecipient.update({
      where: { id: row.id },
      data: {
        // SENT means the mail server accepted it. It is not a delivery
        // confirmation, and nothing in the UI calls it one.
        status: 'SENT',
        sentAt: new Date(),
        messageId: info?.messageId || null,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return { ok: true };
  } catch (err) {
    const permanent = isPermanent(err);
    const exhausted = row.attempts >= row.maxAttempts; // already incremented by the claim
    const dead = permanent || exhausted;

    // Logged WITHOUT the announcement body: the content is reachable from the
    // announcement row if it is ever needed, and an error log is not the place
    // for it. The address is included because it is the thing being diagnosed.
    console.error('[announce] send failed', {
      recipientId: row.id,
      announcementId: announcement.id,
      project: project.id,
      attempt: `${row.attempts}/${row.maxAttempts}`,
      permanent,
      outcome: dead ? 'dead' : 'will retry',
      error: err.message,
    });

    await prisma.projectAnnouncementRecipient.update({
      where: { id: row.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        // Truncated: an SMTP server's HTML error page would otherwise land in
        // the database in full.
        lastError: String(err.message).slice(0, 500),
        runAfter: dead ? row.runAfter : backoffFor(row.attempts),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return { ok: false, dead };
  }
}

/**
 * Recompute one announcement's roll-up from its recipient rows.
 *
 * The roll-up is derived, never incremented: a counter would drift the first
 * time a process died between the send and the bump, and this is the number
 * the admin screen reports as the truth. Cheap enough to redo after every
 * batch.
 *
 * The states, and what each one honestly means:
 *
 *   PENDING     nothing has been attempted yet
 *   PROCESSING  some are sent or still queued; the queue is still moving
 *   COMPLETED   every recipient was accepted by the mail server
 *   PARTIAL     the queue has drained, some were accepted, some gave up
 *   FAILED      the queue has drained and nothing was accepted
 */
async function rollUp(announcementId) {
  const announcement = await prisma.projectAnnouncement.findUnique({
    where: { id: announcementId },
    select: { id: true, emailState: true },
  });
  if (!announcement || announcement.emailState === 'NOT_APPLICABLE') return null;

  const counts = await prisma.projectAnnouncementRecipient.groupBy({
    by: ['status'],
    where: { announcementId },
    _count: { status: true },
  });

  const by = counts.reduce((acc, row) => {
    acc[row.status] = row._count.status;
    return acc;
  }, {});
  const sent = by.SENT || 0;
  const dead = by.DEAD || 0;
  const pending = (by.QUEUED || 0) + (by.SENDING || 0) + (by.FAILED || 0);
  const total = sent + dead + pending;

  let state;
  if (total === 0) state = 'COMPLETED';            // nobody to mail
  else if (pending > 0) state = sent + dead === 0 ? 'PENDING' : 'PROCESSING';
  else if (dead === 0) state = 'COMPLETED';
  else if (sent === 0) state = 'FAILED';
  else state = 'PARTIAL';

  if (state !== announcement.emailState) {
    await prisma.projectAnnouncement.update({
      where: { id: announcementId },
      data: { emailState: state },
    });
  }
  return { state, sent, dead, pending, total };
}

/**
 * One pass: claim a batch, send it, roll up what it touched. Never throws.
 *
 * Deliberately NOT gated on `paused`: this is the explicit "send now" that the
 * interval, kick(), an operator and the tests all funnel into, and a paused
 * worker still has to be drainable on demand.
 */
async function tick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const rows = await claimBatch();
    if (!rows.length) return { processed: 0 };

    // The banner is the same file for every recipient of an announcement, so
    // it is resolved once per project per tick rather than once per email.
    const banners = new Map();
    const touched = new Set();
    let ok = 0;
    let failed = 0;

    // Sequential, not Promise.all: the whole point of batchSize is to be
    // gentle with the mail server, and parallel sends would defeat it.
    for (const row of rows) {
      const project = row.announcement.project;
      if (!banners.has(project.id)) banners.set(project.id, await bannerPathFor(project));
      const result = await processRecipient(row, { bannerPath: banners.get(project.id) });
      touched.add(row.announcementId);
      if (result.ok) ok += 1;
      else failed += 1;
    }

    for (const id of touched) await rollUp(id);

    return { processed: rows.length, ok, failed };
  } catch (err) {
    console.error('[announce] worker tick failed', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}

/**
 * Re-queue the recipients an announcement gave up on.
 *
 * The operator escape hatch behind the admin panel's "Retry failed" button.
 *
 * `status: { in: ['DEAD'] }` is the whole safety property: a row that reached
 * SENT is not in the filter, so it cannot be re-queued and that member cannot
 * receive a second copy. FAILED rows are left alone too — they are already
 * going to be retried on their own backoff, and resetting them would only
 * bring the next attempt forward.
 */
async function retryFailed(announcementId) {
  const result = await prisma.projectAnnouncementRecipient.updateMany({
    where: { announcementId, status: 'DEAD' },
    data: {
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
      runAfter: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (result.count > 0) await rollUp(announcementId);
  return result.count;
}

/**
 * Start the interval.
 *
 * `unref()` so an idle worker never holds the event loop open — without it a
 * script that requires this module would hang on exit instead of finishing.
 */
/**
 * Start sending without waiting for the next interval.
 *
 * Fire and forget: a lifecycle action calls this so the first emails leave
 * immediately instead of up to one interval later, and must never be held open
 * by it. A failure here is not a failure of the announcement - the rows are
 * committed and the next tick will find them.
 */
function kick() {
  if (paused) return;
  tick().catch((err) => console.error('[announce] kicked tick failed:', err.message));
}

/** Stop sending on our own. Queued rows stay exactly where they are. */
function pause() { paused = true; }

/** Resume automatic sending, and look for the backlog straight away. */
function resume() {
  paused = false;
  kick();
}

const isPaused = () => paused;

function start() {
  if (timer) return;
  console.log(`[announce] announcement worker started (every ${CONFIG.intervalMs}ms, ${CONFIG.batchSize}/tick)`);
  timer = setInterval(kick, CONFIG.intervalMs);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  start,
  stop,
  tick,
  kick,
  pause,
  resume,
  isPaused,
  claimBatch,
  processRecipient,
  bannerPathFor,
  rollUp,
  retryFailed,
  backoffFor,
  isPermanent,
  CONFIG,
  WORKER_ID,
};
