// src/services/auditTrail.js
//
// Super-admin actions get a stronger audit record than the rest of the portal.
//
// The existing `AdminLog` rows record only an action name — `UPDATE_MEMBER`
// tells you someone edited a member, not what they changed or what it was
// before. For actions that can rewrite a person's identity or delete their
// account, that is not enough to answer the only question that matters after
// the fact: what exactly was changed, by whom, and from what?
//
// `recordChange` writes the before/after pair into `AdminLog.details`, which is
// already a Json column, so this needs no migration.
//
// Unlike `logActivity`, this one is awaited. A privileged action that cannot be
// recorded should fail rather than happen unobserved.

const prisma = require('../utils/prismaClient');

// Never let a value like this reach a log row.
const REDACTED_KEYS = new Set(['passwordHash', 'password', 'newPassword', 'token']);

/** Mask anything secret, so a diff can be logged without copying credentials. */
function scrub(value) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACTED_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}

/**
 * The fields that actually changed, as { field: { from, to } }.
 * Compared with JSON equality so arrays (interests) and dates behave.
 */
function diff(before = {}, after = {}) {
  const changes = {};
  for (const key of Object.keys(after)) {
    if (REDACTED_KEYS.has(key)) {
      changes[key] = { from: '[redacted]', to: '[redacted]' };
      continue;
    }
    const a = before?.[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      changes[key] = { from: a ?? null, to: b ?? null };
    }
  }
  return changes;
}

/**
 * Record one privileged action against a target.
 *
 * @param {object}  entry
 * @param {object}  entry.actor     req.user
 * @param {string}  entry.action    e.g. 'SA_UPDATE_USER'
 * @param {string} [entry.targetId] the user the action is about
 * @param {object} [entry.before]   state before, for the diff
 * @param {object} [entry.after]    state after, for the diff
 * @param {object} [entry.extra]    anything else worth keeping
 */
async function recordChange({ actor, action, targetId, before, after, extra }) {
  const changes = before || after ? diff(before, after) : undefined;

  return prisma.adminLog.create({
    data: {
      adminId:  actor.id,
      // The FK is to users, so only a real member id may go here. Project,
      // company and transaction ids travel in `details` instead.
      targetId: targetId || null,
      action,
      details: {
        actorEmail: actor.email,
        actorRole:  actor.role,
        ...(changes && Object.keys(changes).length ? { changes } : {}),
        ...(extra ? { ...scrub(extra) } : {}),
      },
    },
  });
}

module.exports = { recordChange, diff, scrub };
