// src/services/emailBroadcastWorker.js
//
// The background sender for admin email broadcasts.
//
// This is a deliberate near-copy of services/announcementWorker.js, pointed
// at EmailBroadcastRecipient instead of ProjectAnnouncementRecipient. Same
// reasoning as that file gives for copying services/i18n/worker.js: the
// project has no queue, no Redis and no separate worker process, and a
// broadcast is a deliberate admin action - at most a handful a month - so the
// queue is a Postgres table and the worker is an interval inside the API
// process. Using the SAME pattern a third time means an operator who has
// debugged one of these three workers can debug any of them.
//
//   * durability    - a queued email is a row, so it survives a restart. The
//                     rows are written in the broadcast's own transaction
//                     (services/emailBroadcast.js), so "created but nothing
//                     queued" is not a state that exists.
//   * safe claiming - a conditional UPDATE, so two API processes behind pm2
//                     cluster mode cannot send the same member the same
//                     broadcast twice.
//   * stale locks   - a row left SENDING past the timeout is reclaimed.
//   * no duplicates - a row that reached SENT is never claimed again, by the
//                     worker or by the retry endpoint.
//   * bounded retry - exponential backoff with jitter, then DEAD.
//
// Separate env vars from the announcement worker (BROADCAST_* rather than
// ANNOUNCEMENT_*), so tuning one queue never silently retunes the other.
const prisma = require('../utils/prismaClient');
const mailer = require('./mailer');

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const CONFIG = {
  intervalMs: Number(process.env.BROADCAST_WORKER_INTERVAL_MS || 10000),
  batchSize: Number(process.env.BROADCAST_WORKER_BATCH || 20),
  staleLockMs: Number(process.env.BROADCAST_STALE_LOCK_MS || 5 * 60 * 1000),
  backoffBaseMs: Number(process.env.BROADCAST_BACKOFF_BASE_MS || 60000),
};

let timer = null;
let running = false;
// Gates the AUTOMATIC entry points (the interval and kick()), not tick()
// itself - an operator or test can still drain the queue deliberately while
// automatic sending is paused. Exists for an SMTP incident: pausing stops the
// worker burning attempts on every queued recipient while leaving every row
// exactly where it is.
let paused = false;

/** Exponential backoff with jitter, identical to announcementWorker.backoffFor. */
function backoffFor(attempts) {
  const base = CONFIG.backoffBaseMs * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(base, 2 * 60 * 60 * 1000);
  return new Date(Date.now() + capped + Math.random() * capped * 0.25);
}

/** Permanent failures - see announcementWorker.isPermanent for the reasoning. */
function isPermanent(err) {
  const code = err?.responseCode;
  if (typeof code === 'number' && code >= 500 && code < 600) return true;
  return ['EENVELOPE', 'EMESSAGE'].includes(err?.code);
}

/**
 * Claim up to `limit` recipient rows for this worker.
 *
 * Two-step, matching announcementWorker.claimBatch: find candidates, then
 * claim each with a conditional UPDATE whose WHERE still names the status it
 * must have had. If another process won the race the update affects zero
 * rows and this worker moves on.
 */
async function claimBatch(limit = CONFIG.batchSize) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CONFIG.staleLockMs);

  const candidates = await prisma.emailBroadcastRecipient.findMany({
    where: {
      OR: [
        { status: { in: ['QUEUED', 'FAILED'] }, runAfter: { lte: now } },
        { status: 'SENDING', lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ broadcast: { createdAt: 'asc' } }, { id: 'asc' }],
    take: limit,
    select: { id: true, status: true },
  });

  const claimed = [];
  for (const candidate of candidates) {
    const result = await prisma.emailBroadcastRecipient.updateMany({
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
  return prisma.emailBroadcastRecipient.findMany({
    where: { id: { in: claimed } },
    include: { broadcast: true },
  });
}

/**
 * Send to one recipient and record the outcome. Exported because it is the
 * real unit of work - tests drive it directly, and a future external queue
 * would call exactly this.
 */
async function processRecipient(row) {
  const { broadcast } = row;

  try {
    const info = await mailer.sendCustomBroadcastEmail({
      to: row.email,
      name: row.name,
      subject: broadcast.subject,
      heading: broadcast.heading,
      intro: broadcast.intro,
      bodyText: broadcast.bodyText,
      ctaLabel: broadcast.ctaLabel,
      ctaUrl: broadcast.ctaUrl,
    });

    await prisma.emailBroadcastRecipient.update({
      where: { id: row.id },
      data: {
        // SENT means the mail server accepted it - not a delivery
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

    console.error('[broadcast] send failed', {
      recipientId: row.id,
      broadcastId: broadcast.id,
      attempt: `${row.attempts}/${row.maxAttempts}`,
      permanent,
      outcome: dead ? 'dead' : 'will retry',
      error: err.message,
    });

    await prisma.emailBroadcastRecipient.update({
      where: { id: row.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
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
 * Recompute one broadcast's roll-up from its recipient rows. Derived, never
 * incremented - see announcementWorker.rollUp for the five states' meaning.
 */
async function rollUp(broadcastId) {
  const broadcast = await prisma.emailBroadcast.findUnique({
    where: { id: broadcastId },
    select: { id: true, emailState: true },
  });
  if (!broadcast) return null;

  const counts = await prisma.emailBroadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
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
  if (total === 0) state = 'COMPLETED';
  else if (pending > 0) state = sent + dead === 0 ? 'PENDING' : 'PROCESSING';
  else if (dead === 0) state = 'COMPLETED';
  else if (sent === 0) state = 'FAILED';
  else state = 'PARTIAL';

  if (state !== broadcast.emailState) {
    await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { emailState: state } });
  }
  return { state, sent, dead, pending, total };
}

/** One pass: claim a batch, send it, roll up what it touched. Never throws. */
async function tick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const rows = await claimBatch();
    if (!rows.length) return { processed: 0 };

    const touched = new Set();
    let ok = 0;
    let failed = 0;

    // Sequential, not Promise.all: batchSize exists to be gentle with the
    // mail server, and parallel sends would defeat it.
    for (const row of rows) {
      const result = await processRecipient(row);
      touched.add(row.broadcastId);
      if (result.ok) ok += 1;
      else failed += 1;
    }

    for (const id of touched) await rollUp(id);

    return { processed: rows.length, ok, failed };
  } catch (err) {
    console.error('[broadcast] worker tick failed', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}

/**
 * Re-queue the recipients a broadcast gave up on.
 *
 * `status: 'DEAD'` is the whole safety property: a row that reached SENT is
 * not in the filter, so it cannot be re-queued and that member cannot
 * receive a second copy. FAILED rows are left alone - they are already going
 * to be retried on their own backoff.
 */
async function retryFailed(broadcastId) {
  const result = await prisma.emailBroadcastRecipient.updateMany({
    where: { broadcastId, status: 'DEAD' },
    data: {
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
      runAfter: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (result.count > 0) await rollUp(broadcastId);
  return result.count;
}

/** Start sending without waiting for the next interval. Fire and forget. */
function kick() {
  if (paused) return;
  tick().catch((err) => console.error('[broadcast] kicked tick failed:', err.message));
}

function pause() { paused = true; }

function resume() {
  paused = false;
  kick();
}

const isPaused = () => paused;

function start() {
  if (timer) return;
  console.log(`[broadcast] email broadcast worker started (every ${CONFIG.intervalMs}ms, ${CONFIG.batchSize}/tick)`);
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
  rollUp,
  retryFailed,
  backoffFor,
  isPermanent,
  CONFIG,
  WORKER_ID,
};
