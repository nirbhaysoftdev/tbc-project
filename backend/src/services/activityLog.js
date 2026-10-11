// src/services/activityLog.js
//
// One append-only feed of everything notable the system does: emails sent,
// member requests and approvals, investment requests, profit, withdrawals.
//
// Logging must NEVER break the thing being logged, so `logActivity` swallows
// its own errors and is always called without awaiting the caller's result.
const prisma = require('../utils/prismaClient');

// The catalogue. Adding a type here is all that is needed - the admin Logs
// page builds its filters from this same list (served by /admin/logs/types).
const ACTIVITY = {
  // ── Email ──
  EMAIL_SENT:                 { category: 'EMAIL',      label: 'Email sent' },
  EMAIL_FAILED:               { category: 'EMAIL',      label: 'Email failed' },

  // ── Membership ──
  MEMBER_REGISTERED:          { category: 'MEMBER',     label: 'Member request (signup)' },
  MEMBER_APPROVED:            { category: 'MEMBER',     label: 'Member approved' },
  MEMBER_REJECTED:            { category: 'MEMBER',     label: 'Member rejected' },
  MEMBER_CREATED:             { category: 'MEMBER',     label: 'Member created by admin' },
  MEMBER_UPDATED:             { category: 'MEMBER',     label: 'Member updated' },
  MEMBER_DELETED:             { category: 'MEMBER',     label: 'Member deleted' },
  MEMBER_FROZEN:              { category: 'MEMBER',     label: 'Member frozen' },
  MEMBER_UNFROZEN:            { category: 'MEMBER',     label: 'Member unfrozen' },
  KYC_SUBMITTED:              { category: 'MEMBER',     label: 'KYC submitted' },

  // ── Investment ──
  INVESTMENT_REQUESTED:       { category: 'INVESTMENT', label: 'Investment request raised' },
  INVESTMENT_PAYMENT_RECEIVED:{ category: 'INVESTMENT', label: 'Investment payment received' },
  INVESTMENT_REQUEST_REJECTED:{ category: 'INVESTMENT', label: 'Investment request rejected' },
  INVESTMENT_COMPLETED:       { category: 'INVESTMENT', label: 'Investment completed' },
  INVESTMENT_CREATED:         { category: 'INVESTMENT', label: 'Capital booked by admin' },
  CAPITAL_RETURNED:           { category: 'INVESTMENT', label: 'Capital returned' },
  PROJECT_CREATED:            { category: 'INVESTMENT', label: 'Project created' },

  // ── Profit ──
  PROFIT_GIVEN:               { category: 'PROFIT',     label: 'Profit given (one-time)' },
  PROFIT_CONFIG_SET:          { category: 'PROFIT',     label: 'Monthly profit configured' },
  PROFIT_MONTHLY_GENERATED:   { category: 'PROFIT',     label: 'Monthly profit generated' },

  // ── Withdrawal ──
  WITHDRAWAL_REQUESTED:       { category: 'WITHDRAWAL', label: 'Withdrawal requested' },
  WITHDRAWAL_APPROVED:        { category: 'WITHDRAWAL', label: 'Withdrawal done (approved)' },
  WITHDRAWAL_REJECTED:        { category: 'WITHDRAWAL', label: 'Withdrawal rejected' },

  // ── Wallet / ledger ──
  WALLET_UPDATED:             { category: 'WALLET',     label: 'Wallet updated' },
  WALLET_ACTIVATED:           { category: 'WALLET',     label: 'Wallet activated' },
  TRANSACTION_ADDED:          { category: 'WALLET',     label: 'Transaction added' },

  // ── System ──
  STATEMENT_SENT:             { category: 'SYSTEM',     label: 'Statement sent' },
  DATA_EXPORTED:              { category: 'SYSTEM',     label: 'Data exported' },
};

const CATEGORIES = ['EMAIL', 'MEMBER', 'INVESTMENT', 'PROFIT', 'WITHDRAWAL', 'WALLET', 'SYSTEM'];

/**
 * Append one line to the activity feed. Fire and forget - callers must not
 * await it in a way that can fail their own request.
 *
 * @param {object}  entry
 * @param {string}  entry.type        a key of ACTIVITY
 * @param {string}  entry.title       one-line human summary
 * @param {string} [entry.description]
 * @param {string} [entry.actorId]    who did it (null = system)
 * @param {string} [entry.actorName]
 * @param {string} [entry.targetId]   which member it is about
 * @param {string} [entry.targetName]
 * @param {number} [entry.amount]
 * @param {string} [entry.status]     SUCCESS (default) | FAILED
 * @param {object} [entry.metadata]
 */
async function logActivity(entry) {
  try {
    const def = ACTIVITY[entry.type];
    if (!def) {
      console.warn(`activityLog: unknown type "${entry.type}" - logged as SYSTEM`);
    }
    await prisma.activityLog.create({
      data: {
        type:        entry.type,
        category:    def?.category || 'SYSTEM',
        title:       entry.title || def?.label || entry.type,
        description: entry.description ?? null,
        actorId:     entry.actorId ?? null,
        actorName:   entry.actorName ?? null,
        targetId:    entry.targetId ?? null,
        targetName:  entry.targetName ?? null,
        amount:      entry.amount == null ? null : Number(entry.amount),
        status:      entry.status || 'SUCCESS',
        metadata:    entry.metadata ?? undefined,
      },
    });
  } catch (err) {
    // Logging is best-effort by design: never surface this to the caller.
    console.error('activityLog failed:', err.message);
  }
}

module.exports = { logActivity, ACTIVITY, CATEGORIES };
