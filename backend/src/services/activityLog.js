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
  // Both are written by code that predates them being catalogued here, so the
  // rows already exist with category SYSTEM. Listing them is what gives the
  // Logs page a filter for "who changed where our mail goes?".
  ENQUIRY_RECIPIENT_CHANGED:  { category: 'SYSTEM',     label: 'Enquiry recipients changed' },
  SIGNUP_NOTIFY_CHANGED:      { category: 'SYSTEM',     label: 'New-signup recipients changed' },

  // ── Super admin ──
  // Everything only a SUPER_ADMIN can do. Kept in its own category so the
  // Logs page can show the privileged actions on their own, which is the
  // view you want when answering "who changed this account?".
  MEMBER_RESTORED:            { category: 'SUPER_ADMIN', label: 'Member restored' },
  MEMBER_PURGED:              { category: 'SUPER_ADMIN', label: 'Member permanently purged' },
  MEMBER_PROFILE_EDITED:      { category: 'SUPER_ADMIN', label: 'Member record edited' },
  ROLE_CHANGED:               { category: 'SUPER_ADMIN', label: 'Role changed' },
  EMAIL_CHANGED:              { category: 'SUPER_ADMIN', label: 'Member email changed' },
  PASSWORD_RESET_BY_ADMIN:    { category: 'SUPER_ADMIN', label: 'Password reset by super admin' },
  DOCUMENT_UPLOADED:          { category: 'SUPER_ADMIN', label: 'Identity document uploaded' },
  DOCUMENT_DELETED:           { category: 'SUPER_ADMIN', label: 'Identity document deleted' },
  KYC_DOCUMENT_REVIEWED:      { category: 'SUPER_ADMIN', label: 'KYC document reviewed' },
  IMPERSONATION_STARTED:      { category: 'SUPER_ADMIN', label: 'Impersonation started' },
  PROJECT_DELETED:            { category: 'SUPER_ADMIN', label: 'Project deleted' },
  PROJECT_TRANSFERRED:        { category: 'SUPER_ADMIN', label: 'Project ownership transferred' },
  COMPANY_DELETED:            { category: 'SUPER_ADMIN', label: 'Company deleted' },
  COMPANY_TRANSFERRED:        { category: 'SUPER_ADMIN', label: 'Company ownership transferred' },
  POST_DELETED:               { category: 'SUPER_ADMIN', label: 'Post deleted by super admin' },
  COMMENT_DELETED:            { category: 'SUPER_ADMIN', label: 'Comment deleted by super admin' },
  ENQUIRY_DELETED:            { category: 'SUPER_ADMIN', label: 'Enquiry deleted' },
  TRANSACTION_REVERSED:       { category: 'SUPER_ADMIN', label: 'Transaction reversed' },
};

const CATEGORIES = ['EMAIL', 'MEMBER', 'INVESTMENT', 'PROFIT', 'WITHDRAWAL', 'WALLET', 'SYSTEM', 'SUPER_ADMIN'];

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
