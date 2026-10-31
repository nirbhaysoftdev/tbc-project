// src/services/emailBroadcast.js
//
// The rules behind the admin "Email Communication" composer: who can be
// mailed, how an admin's select/exclude choice narrows that, and the one
// transaction that writes a broadcast together with its outbox.
//
// This is a deliberate copy of services/projectLaunch.js's audience and
// selection logic, trimmed to one audience and no project. The two are not
// merged into a shared module because a broadcast has no project - bolting an
// optional projectId onto the announcement tables would make every existing
// query there handle a case that was never possible before. Keeping the same
// SHAPE (normalizeSelection, applySelection, resolveAudience, MAX_SELECTION)
// means an operator who has debugged one can debug the other.
//
// No Express and no mail in this file: the controller decides who may act and
// what to answer, the worker (services/emailBroadcastWorker.js) does the
// sending, and this module is the rules. That split is what lets a test drive
// a broadcast with no request and no SMTP server.
const prisma = require('../utils/prismaClient');
const { LIVE_USER } = require('../utils/roles');

/**
 * Who a broadcast can reach: ACTIVE, non-deleted users. Admins are included -
 * they are members of the community too. Pending, frozen and rejected
 * accounts are never mailed, matching every other outbound mail in the
 * portal (see projectLaunch.js's AUDIENCES for the same rule, documented
 * there).
 *
 * Stored on the row as a string (`audience`) rather than assumed, for the
 * same reason projectLaunch.js does it: the day a second audience is added,
 * every broadcast sent before it existed must stay unambiguous about who it
 * actually reached.
 */
const DEFAULT_AUDIENCE = 'ALL_ACTIVE_MEMBERS';
const AUDIENCE_WHERE = { ...LIVE_USER, status: 'ACTIVE' };

const AUDIENCE_MODES = {
  ALL: 'Everyone in the audience',
  INCLUDE: 'Only the members I select',
  EXCLUDE: 'Everyone except the members I select',
};

/** How many members an admin may tick in one go. Same cap as projectLaunch.js. */
const MAX_SELECTION = 5000;

/**
 * Coerce a client-supplied recipient selection into something storable.
 *
 * Deny-by-default on the mode: anything unrecognised is ALL, and an empty id
 * list is likewise ALL - a malformed selection must never silently narrow who
 * a broadcast reaches. Copied from projectLaunch.normalizeSelection.
 */
function normalizeSelection(input) {
  const raw = input || {};
  const mode = Object.prototype.hasOwnProperty.call(AUDIENCE_MODES, raw.mode) ? raw.mode : 'ALL';
  if (mode === 'ALL') return { mode: 'ALL', userIds: [] };

  const seen = new Set();
  for (const value of Array.isArray(raw.userIds) ? raw.userIds : []) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && id.length <= 64) seen.add(id);
    if (seen.size >= MAX_SELECTION) break;
  }
  const userIds = [...seen];
  if (userIds.length === 0) return { mode: 'ALL', userIds: [] };
  return { mode, userIds };
}

/** Apply a normalised selection to a list of rows carrying `userId`. */
function applySelection(rows, selection) {
  const { mode, userIds } = normalizeSelection(selection);
  if (mode === 'ALL') return rows;
  const set = new Set(userIds);
  return mode === 'INCLUDE'
    ? rows.filter((row) => row.userId && set.has(row.userId))
    : rows.filter((row) => !row.userId || !set.has(row.userId));
}

/**
 * Every member the picker can offer, in the shape it needs.
 *
 * Admin-facing only, behind `requireAdmin`: it carries email addresses, which
 * services/memberVisibility.js exists to keep out of every member-facing
 * payload. An admin already sees these on the members screen.
 */
async function audienceMembers() {
  const users = await prisma.user.findMany({
    where: AUDIENCE_WHERE,
    select: { id: true, name: true, email: true, role: true, profilePhoto: true },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });
  return users
    .filter((user) => (user.email || '').trim())
    .map((user) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      role: user.role,
      profilePhoto: user.profilePhoto || null,
    }));
}

/**
 * The recipients for the audience, as outbox rows, after the admin's
 * selection has been applied.
 *
 * Addresses are snapshotted here and never read from the User row again -
 * the history has to say where the mail actually went, and a member who
 * changes their address next week must not rewrite that. De-duplicated
 * case-insensitively on email, same reasoning as projectLaunch.resolveAudience.
 *
 * `audienceSize` is the figure BEFORE the selection - the denominator the
 * panel shows beside the recipient count.
 */
async function resolveAudience(selection = null) {
  const users = await prisma.user.findMany({
    where: AUDIENCE_WHERE,
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set();
  const all = [];
  for (const user of users) {
    const email = (user.email || '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ userId: user.id, email, name: user.name || null });
  }

  return { rows: applySelection(all, selection), audienceSize: all.length };
}

/**
 * Write one broadcast and its outbox, atomically.
 *
 * WHY ONE TRANSACTION. The broadcast row and its recipient rows commit
 * together or not at all - there is no in-memory job to lose, because the
 * queue is the recipient table itself. A crash one millisecond after the
 * commit still has a complete send list waiting on disk.
 *
 * Idempotency is the unique index on `idempotencyKey`. A retried request
 * collides, and the caller is handed the broadcast that already exists,
 * exactly as projectLaunch.createAnnouncement does for announcements.
 */
async function createBroadcast({
  subject, heading, intro, bodyText, ctaLabel, ctaUrl,
  idempotencyKey, selection = null, admin,
}) {
  const existing = await prisma.emailBroadcast.findUnique({ where: { idempotencyKey } });
  if (existing) return { broadcast: existing, created: false };

  const picked = normalizeSelection(selection);
  const { rows: recipients, audienceSize } = await resolveAudience(picked);

  try {
    const broadcast = await prisma.emailBroadcast.create({
      data: {
        idempotencyKey,
        subject,
        heading,
        intro: intro || null,
        bodyText,
        ctaLabel: ctaLabel || null,
        ctaUrl: ctaUrl || null,
        audience: DEFAULT_AUDIENCE,
        audienceMode: picked.mode,
        audienceUserIds: picked.userIds,
        audienceSize,
        adminId: admin?.id || null,
        adminName: admin?.name || null,
        recipientCount: recipients.length,
        // A broadcast with nobody to mail is COMPLETED, not PENDING: a queue
        // that will never move is not "pending".
        emailState: recipients.length === 0 ? 'COMPLETED' : 'PENDING',
        ...(recipients.length > 0
          ? { recipients: { createMany: { data: recipients } } }
          : {}),
      },
    });

    return { broadcast, created: true };
  } catch (err) {
    // P2002 on `idempotencyKey`: two requests carrying the same key raced,
    // and the other one won. Return its row rather than an error.
    if (err?.code === 'P2002') {
      const winner = await prisma.emailBroadcast.findUnique({ where: { idempotencyKey } });
      if (winner) return { broadcast: winner, created: false };
    }
    throw err;
  }
}

module.exports = {
  DEFAULT_AUDIENCE,
  AUDIENCE_MODES,
  MAX_SELECTION,
  normalizeSelection,
  applySelection,
  audienceMembers,
  resolveAudience,
  createBroadcast,
};
