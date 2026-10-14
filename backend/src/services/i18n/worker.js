// src/services/i18n/worker.js
//
// The background translation worker.
//
// WHY THERE IS NO REDIS HERE
// Requirement §6 asks to reuse existing job infrastructure and not to
// introduce Redis without demonstrating need. This project has no queue, no
// Redis and no separate worker process, and the workload does not justify
// adding them: a queue only receives rows when an admin saves content, which
// is a handful of jobs a few times a day. So the queue is a Postgres table
// (already present, already backed up, already in the migration history) and
// the worker is an interval inside the API process.
//
// What that still has to get right, and does:
//
//   * durability    — a job survives a restart because it is a row, not an
//                     in-memory promise
//   * safe claiming — a conditional UPDATE, so two processes behind pm2 cluster
//                     mode cannot run the same job twice
//   * stale locks   — a row RUNNING past the timeout is reclaimed, so a process
//                     killed mid-job does not strand its work
//   * bounded retry — exponential backoff with jitter, then DEAD
//   * version guard — an older job can never overwrite a newer translation
//   * rate limiting — a cap on calls per tick, so a bulk import cannot stampede
//                     the provider
//
// If this project ever grows to a volume where that is not enough, the seam is
// claimBatch()/processJob(): a BullMQ worker would call the same processJob().

const prisma = require('../../utils/prismaClient');
const { getProvider } = require('./providers');
const { TranslationError } = require('./providers/base');
const { translateValue } = require('./html');
const { hashSource } = require('./content');
const { normalizeLanguage } = require('./languages');

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const CONFIG = {
  /** How often to look for work. */
  intervalMs: Number(process.env.TRANSLATION_WORKER_INTERVAL_MS || 15000),
  /** Jobs claimed per tick — the provider rate limit in practice. */
  batchSize: Number(process.env.TRANSLATION_WORKER_BATCH || 5),
  /** A RUNNING row older than this is assumed abandoned and reclaimed. */
  staleLockMs: Number(process.env.TRANSLATION_STALE_LOCK_MS || 5 * 60 * 1000),
  /** Base for exponential backoff: 30s, 60s, 2m, 4m, 8m. */
  backoffBaseMs: Number(process.env.TRANSLATION_BACKOFF_BASE_MS || 30000),
  /** Orphan sweep cadence. Cheap, so hourly is plenty. */
  pruneIntervalMs: Number(process.env.TRANSLATION_PRUNE_INTERVAL_MS || 60 * 60 * 1000),
};

let timer = null;
let pruneTimer = null;
let running = false;

/**
 * Exponential backoff with jitter.
 *
 * The jitter matters: without it, a batch of jobs that all failed against a
 * provider that was briefly down would retry in perfect lockstep and hit it
 * again simultaneously (§11 "handle rate limits").
 */
function backoffFor(attempts) {
  const base = CONFIG.backoffBaseMs * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(base, 60 * 60 * 1000);
  const jitter = Math.random() * capped * 0.25;
  return new Date(Date.now() + capped + jitter);
}

/**
 * Claim up to `limit` jobs for this worker.
 *
 * Two-step on purpose: find candidates, then claim each with a conditional
 * UPDATE whose WHERE still contains the status it must have had. If another
 * process won the race, the update affects zero rows and this worker simply
 * moves on — no job runs twice, no lock table needed.
 */
async function claimBatch(limit = CONFIG.batchSize) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CONFIG.staleLockMs);

  const candidates = await prisma.translationJob.findMany({
    where: {
      OR: [
        // Fresh work and retries whose backoff has elapsed.
        { status: { in: ['QUEUED', 'FAILED'] }, runAfter: { lte: now } },
        // Abandoned by a worker that died holding the lock.
        { status: 'RUNNING', lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [
      // Oldest source version first, so a backlog is worked in the order the
      // content was actually written.
      { sourceVersion: 'asc' },
      { createdAt: 'asc' },
    ],
    take: limit,
    select: { id: true, status: true },
  });

  const claimed = [];
  for (const candidate of candidates) {
    const result = await prisma.translationJob.updateMany({
      where: { id: candidate.id, status: candidate.status },
      data: {
        status: 'RUNNING',
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 1) claimed.push(candidate.id);
  }

  if (!claimed.length) return [];
  return prisma.translationJob.findMany({ where: { id: { in: claimed } } });
}

/**
 * Write a successful result, unless something newer or better is already
 * there.
 *
 * Two guards, both required by §6:
 *
 *   HUMAN_REVIEWED  a machine result never overwrites human work (§12).
 *   sourceVersion   a result carrying an older version than the stored row is
 *                   discarded (§6.A.7, §6 "Ensure older jobs cannot replace
 *                   translations generated for a newer source version").
 *
 * The write itself is an upsert against the unique index, so a retry of a job
 * that actually succeeded cannot create a second row (§12 "retrying jobs must
 * not create duplicate or conflicting translation records").
 */
async function applyResult(job, translated, provider) {
  const existing = await prisma.translation.findUnique({
    where: {
      entityType_entityId_field_language: {
        entityType: job.entityType,
        entityId: job.entityId,
        field: job.field,
        language: job.language,
      },
    },
    select: { status: true, sourceVersion: true },
  });

  if (existing?.status === 'HUMAN_REVIEWED') {
    return { written: false, reason: 'human-reviewed' };
  }
  if (existing && existing.sourceVersion > job.sourceVersion) {
    return { written: false, reason: 'superseded' };
  }

  await prisma.translation.upsert({
    where: {
      entityType_entityId_field_language: {
        entityType: job.entityType,
        entityId: job.entityId,
        field: job.field,
        language: job.language,
      },
    },
    create: {
      entityType: job.entityType,
      entityId: job.entityId,
      field: job.field,
      language: job.language,
      value: translated,
      // Pinned to the hash of the text this was actually made from, which is
      // what the read path compares against.
      sourceHash: job.sourceHash,
      sourceVersion: job.sourceVersion,
      status: 'MACHINE',
      format: job.format,
      provider: provider.name,
      providerModel: provider.model || null,
    },
    update: {
      value: translated,
      sourceHash: job.sourceHash,
      sourceVersion: job.sourceVersion,
      status: 'MACHINE',
      format: job.format,
      provider: provider.name,
      providerModel: provider.model || null,
      // A fresh machine translation clears any previous review stamp — the
      // reviewed text is gone, so claiming it is still reviewed would be wrong.
      reviewedBy: null,
      reviewedAt: null,
    },
  });

  return { written: true };
}

/**
 * Run one job.
 *
 * Exported because it is the real unit of work: tests drive it directly, and a
 * future external queue would call exactly this.
 */
async function processJob(job, provider = getProvider()) {
  const language = normalizeLanguage(job.language);
  if (!language) {
    // Not retryable: the row itself is invalid.
    await prisma.translationJob.update({
      where: { id: job.id },
      data: { status: 'DEAD', lastError: `Unsupported language "${job.language}"`, lockedAt: null, lockedBy: null },
    });
    return { ok: false, dead: true };
  }

  // The stub provider produces nothing translatable. Recognising that here,
  // rather than writing the English text back as though it were a translation,
  // is what keeps "no provider configured" honest: the API serves English and
  // reports the content as untranslated.
  if (provider.passthrough) {
    await prisma.translationJob.update({
      where: { id: job.id },
      data: {
        status: 'DEAD',
        lastError:
          'No translation provider configured (TRANSLATION_PROVIDER=stub). ' +
          'English is served as the fallback. Set a provider to translate.',
        lockedAt: null,
        lockedBy: null,
      },
    });
    return { ok: false, skipped: true };
  }

  try {
    const translated = await translateValue({
      value: job.sourceText,
      format: job.format,
      targetLanguage: language,
      translateBatch: (texts, target, format) => provider.translateBatch(texts, target, format),
    });

    // A provider that echoes the input has not translated it. Storing that
    // would mark the content translated and stop it ever being retried.
    if (!translated || hashSource(translated) === hashSource(job.sourceText)) {
      throw new TranslationError('Provider returned the source text unchanged', {
        retryable: false,
        provider: provider.name,
      });
    }

    const result = await applyResult(job, translated, provider);

    await prisma.translationJob.update({
      where: { id: job.id },
      data: { status: 'DONE', lastError: null, lockedAt: null, lockedBy: null },
    });

    return { ok: true, ...result };
  } catch (err) {
    const retryable = err instanceof TranslationError ? err.retryable : true;
    const attempts = job.attempts; // already incremented by the claim
    const exhausted = attempts >= job.maxAttempts;
    const dead = !retryable || exhausted;

    // Logged with enough context to diagnose, and WITHOUT the content itself:
    // §12 asks that sensitive content is not written to logs unnecessarily, and
    // the source text is reachable from the entity if it is ever needed.
    console.error('[i18n] translation job failed', {
      jobId: job.id,
      entity: `${job.entityType}#${job.entityId}`,
      field: job.field,
      language: job.language,
      provider: provider.name,
      attempt: `${attempts}/${job.maxAttempts}`,
      retryable,
      outcome: dead ? 'dead' : 'will retry',
      error: err.message,
    });

    await prisma.translationJob.update({
      where: { id: job.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        // Truncated: a provider HTML error page would otherwise land in the
        // database in full.
        lastError: String(err.message).slice(0, 500),
        runAfter: dead ? job.runAfter : backoffFor(attempts),
        lockedAt: null,
        lockedBy: null,
      },
    });

    return { ok: false, dead };
  }
}

/** One pass: claim a batch and run it. Never throws. */
async function tick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const jobs = await claimBatch();
    if (!jobs.length) return { processed: 0 };

    const provider = getProvider();
    let ok = 0;
    let failed = 0;

    // Sequential, not Promise.all: the point of batchSize is to be gentle with
    // the provider, and parallel calls would defeat it.
    for (const job of jobs) {
      const result = await processJob(job, provider);
      if (result.ok) ok += 1;
      else failed += 1;
    }

    return { processed: jobs.length, ok, failed };
  } catch (err) {
    console.error('[i18n] worker tick failed', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}

/**
 * Retry dead jobs — the operator escape hatch for §12 "failed translation jobs
 * can be retried without corrupting existing translations". Safe because
 * applyResult still refuses to clobber human review or a newer version.
 */
async function retryDeadJobs({ entityType, entityId, language } = {}) {
  const where = { status: 'DEAD' };
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (language) where.language = language;

  const result = await prisma.translationJob.updateMany({
    where,
    data: { status: 'QUEUED', attempts: 0, lastError: null, runAfter: new Date(), lockedAt: null, lockedBy: null },
  });
  return result.count;
}

/**
 * Start the interval.
 *
 * `unref()` so an idle worker never holds the event loop open — without it a
 * script that requires this module would hang on exit instead of finishing.
 */
function start() {
  if (timer) return;

  const provider = getProvider();
  if (provider.passthrough) {
    console.log(
      '[i18n] translation worker idle — TRANSLATION_PROVIDER is "stub", so dynamic content ' +
        'is served in English. Set TRANSLATION_PROVIDER (see SETUP.md) to enable translation.',
    );
    // Deliberately still started: jobs are queued and marked so the admin view
    // shows exactly what would be translated once a provider is configured.
  } else {
    console.log(`[i18n] translation worker started (provider: ${provider.name}, every ${CONFIG.intervalMs}ms)`);
  }

  timer = setInterval(() => { void tick(); }, CONFIG.intervalMs);
  timer.unref?.();

  const { pruneOrphans } = require('./translationService');
  pruneTimer = setInterval(() => {
    pruneOrphans().catch((err) => console.error('[i18n] prune failed', err.message));
  }, CONFIG.pruneIntervalMs);
  pruneTimer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  if (pruneTimer) clearInterval(pruneTimer);
  timer = null;
  pruneTimer = null;
}

module.exports = {
  start,
  stop,
  tick,
  processJob,
  claimBatch,
  applyResult,
  retryDeadJobs,
  backoffFor,
  CONFIG,
  WORKER_ID,
};
