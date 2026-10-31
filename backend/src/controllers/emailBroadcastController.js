// src/controllers/emailBroadcastController.js
//
// The admin "Email Communication" broadcast: write a message, preview it,
// pick who gets it (select or exclude), send, and review the delivery
// history. Mounted on /api/admin behind `requireAdmin` in routes/emailBroadcasts.js
// - ADMIN and SUPER_ADMIN both act here, with no further gate, because
// sending a message to the community is not a super-admin-only power the way
// issuing API keys or managing other admins is.
//
// Every endpoint re-validates; the frontend hides nothing that would matter
// if skipped. See services/emailBroadcast.js for the audience/selection rules
// and services/emailBroadcastWorker.js for the sender.
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { logActivity } = require('../services/activityLog');
const { memberCardSelect } = require('../services/memberVisibility');
const broadcast = require('../services/emailBroadcast');
const mailer = require('../services/mailer');
const worker = require('../services/emailBroadcastWorker');

const LIMITS = { subject: 200, heading: 200, intro: 300, bodyText: 8000, ctaLabel: 60, ctaUrl: 2000 };

const text = (value, max) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
};

const isHttpUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * An idempotency key supplied by the composer. Constrained rather than
 * trusted, same as projectAnnouncementController.idempotencyKey: it goes
 * into a unique index, so an unbounded value would be a cheap way to bloat
 * it. A caller that sends none gets a random one.
 */
const idempotencyKey = (value) => {
  const given = text(value, 100);
  if (given && /^[A-Za-z0-9:_.-]{8,100}$/.test(given)) return `broadcast:${given}`;
  return `broadcast:${crypto.randomUUID()}`;
};

/** Shared field validation for /preview and the real create. */
function readFields(body) {
  const subject = text(body?.subject, LIMITS.subject);
  const heading = text(body?.heading, LIMITS.heading);
  const intro = text(body?.intro, LIMITS.intro);
  const bodyText = text(body?.bodyText, LIMITS.bodyText);
  const ctaLabel = text(body?.ctaLabel, LIMITS.ctaLabel);
  const ctaUrl = text(body?.ctaUrl, LIMITS.ctaUrl);

  const errors = [];
  if (!subject) errors.push('Subject is required.');
  if (!heading) errors.push('Heading is required.');
  if (!bodyText) errors.push('Message is required.');
  if (ctaUrl && !isHttpUrl(ctaUrl)) errors.push('Button link must be a valid http(s) URL.');

  return {
    fields: { subject, heading, intro, bodyText, ctaLabel, ctaUrl },
    errors,
  };
}

// ── The recipient picker (admin only) ─────────
/**
 * GET /admin/broadcasts/audience
 *
 * Every member a broadcast could reach, so the admin can tick or untick them
 * before sending. ADMIN ONLY: this is a list of names and email addresses,
 * which services/memberVisibility.js exists to keep out of every
 * member-facing payload. The list is live - see
 * components/projects/RecipientSelector.tsx's header comment for why that is
 * the right behaviour for EXCLUDE vs INCLUDE.
 */
const getAudience = async (_req, res) => {
  try {
    const members = await broadcast.audienceMembers();
    res.json({
      audience: broadcast.DEFAULT_AUDIENCE,
      label: 'All active members',
      total: members.length,
      maxSelection: broadcast.MAX_SELECTION,
      members,
    });
  } catch (err) {
    console.error('getAudience error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /admin/broadcasts/preview
 *
 * Renders the email without sending or writing anything, for the composer's
 * live preview pane. Rendered against a sample name, same as tbc-mailer's
 * /api/preview.
 */
const preview = (req, res) => {
  const { fields, errors } = readFields(req.body);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const name = text(req.body?.previewName, 100) || 'there';
  res.json({
    subject: fields.subject,
    html: mailer.customEmailHtml({
      name, heading: fields.heading, intro: fields.intro,
      bodyText: fields.bodyText, ctaLabel: fields.ctaLabel, ctaUrl: fields.ctaUrl,
    }),
  });
};

/**
 * POST /admin/broadcasts
 *
 * Creates the broadcast and its outbox in one transaction
 * (services/emailBroadcast.createBroadcast), then kicks the worker so the
 * first emails leave immediately rather than up to one interval later.
 */
const createBroadcast = async (req, res) => {
  const { fields, errors } = readFields(req.body);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const selectionInput = req.body?.selection || null;
  // INCLUDE with nothing selected is a 400, not a silent widen to ALL -
  // normalizeSelection would otherwise turn it into "everyone", which is the
  // opposite of what an admin who ticked nobody asked for. Same rule as
  // projectAnnouncementController.majorUpdate.
  if (selectionInput?.mode === 'INCLUDE' && !(Array.isArray(selectionInput.userIds) && selectionInput.userIds.length)) {
    return res.status(400).json({ error: 'Select at least one member for "Only the members I select".' });
  }

  try {
    const { broadcast: row, created } = await broadcast.createBroadcast({
      ...fields,
      idempotencyKey: idempotencyKey(req.body?.sessionId),
      selection: selectionInput,
      admin: req.user,
    });

    if (created) {
      worker.kick();
      logActivity({
        type: 'EMAIL_BROADCAST_SENT',
        title: `Email broadcast: ${row.subject}`,
        description: `${row.recipientCount} recipient(s), audience ${row.audienceMode}`,
        actorId: req.user.id,
        actorName: req.user.name,
        metadata: { broadcastId: row.id, recipientCount: row.recipientCount, audienceMode: row.audienceMode },
      });
    }

    res.status(created ? 201 : 200).json({
      message: created
        ? (row.recipientCount > 0
          ? `Queued for ${row.recipientCount} recipient(s). Delivery is being processed.`
          : 'No recipients matched this selection - nothing was queued.')
        : 'This broadcast was already sent.',
      broadcast: row,
    });
  } catch (err) {
    console.error('createBroadcast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** Shape one broadcast row for the history list / detail, counts not addresses. */
async function shapeBroadcast(row, countsByStatus) {
  const by = countsByStatus || {};
  const sent = by.SENT || 0;
  const dead = by.DEAD || 0;
  const pending = (by.QUEUED || 0) + (by.SENDING || 0) + (by.FAILED || 0);

  const failures = dead > 0
    ? (await prisma.emailBroadcastRecipient.findMany({
      where: { broadcastId: row.id, status: 'DEAD' },
      select: { lastError: true },
      distinct: ['lastError'],
      take: 5,
    })).map((r) => r.lastError).filter(Boolean)
    : [];

  return {
    id: row.id,
    subject: row.subject,
    heading: row.heading,
    intro: row.intro,
    bodyText: row.bodyText,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    admin: row.admin || null,
    adminName: row.admin?.name || row.adminName,
    createdAt: row.createdAt,
    audienceSelection: {
      mode: row.audienceMode,
      audienceSize: row.audienceSize,
      selectedCount: (row.audienceUserIds || []).length,
      label: row.audienceMode === 'ALL'
        ? null
        : (row.audienceMode === 'INCLUDE'
          ? `Only ${(row.audienceUserIds || []).length} selected member(s)`
          : `${(row.audienceUserIds || []).length} member(s) excluded`),
    },
    email: {
      state: row.emailState,
      recipients: row.recipientCount,
      accepted: sent,
      failed: dead,
      pending,
      failures,
      canRetry: dead > 0,
    },
  };
}

/**
 * GET /admin/broadcasts
 *
 * Paginated history. Recipient rows are aggregated, never listed - the
 * screen needs counts, not addresses.
 */
const listBroadcasts = async (req, res) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      prisma.emailBroadcast.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: { admin: { select: memberCardSelect() } },
      }),
      prisma.emailBroadcast.count(),
    ]);

    const ids = rows.map((r) => r.id);
    const grouped = ids.length
      ? await prisma.emailBroadcastRecipient.groupBy({
        by: ['broadcastId', 'status'],
        where: { broadcastId: { in: ids } },
        _count: { status: true },
      })
      : [];
    const counts = new Map();
    for (const g of grouped) {
      const entry = counts.get(g.broadcastId) || {};
      entry[g.status] = g._count.status;
      counts.set(g.broadcastId, entry);
    }

    const shaped = await Promise.all(rows.map((r) => shapeBroadcast(r, counts.get(r.id))));
    res.json({ broadcasts: shaped, total, page, pageSize: take });
  } catch (err) {
    console.error('listBroadcasts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** GET /admin/broadcasts/:id */
const getBroadcast = async (req, res) => {
  try {
    const row = await prisma.emailBroadcast.findUnique({
      where: { id: req.params.id },
      include: { admin: { select: memberCardSelect() } },
    });
    if (!row) return res.status(404).json({ error: 'Broadcast not found' });

    const grouped = await prisma.emailBroadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcastId: row.id },
      _count: { status: true },
    });
    const by = grouped.reduce((acc, g) => { acc[g.status] = g._count.status; return acc; }, {});

    res.json({ broadcast: await shapeBroadcast(row, by) });
  } catch (err) {
    console.error('getBroadcast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /admin/broadcasts/:id/retry
 *
 * Re-queue the recipients this broadcast gave up on. Rows already accepted
 * are not eligible, so nobody receives a second copy.
 */
const retryBroadcast = async (req, res) => {
  try {
    const row = await prisma.emailBroadcast.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Broadcast not found' });

    const requeued = await worker.retryFailed(row.id);
    if (requeued > 0) worker.kick();

    logActivity({
      type: 'EMAIL_BROADCAST_RETRIED',
      title: `Email broadcast retried: ${row.subject}`,
      description: `${requeued} failed recipient(s) re-queued`,
      actorId: req.user.id,
      actorName: req.user.name,
      metadata: { broadcastId: row.id, requeued },
    });

    res.json({
      message: requeued > 0
        ? `${requeued} failed recipient(s) re-queued. Email delivery is being processed.`
        : 'There are no failed recipients to retry for this broadcast.',
      requeued,
    });
  } catch (err) {
    console.error('retryBroadcast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAudience,
  preview,
  createBroadcast,
  listBroadcasts,
  getBroadcast,
  retryBroadcast,
};
