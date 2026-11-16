// src/services/transactionAdjust.js
//
// Super admin: correct a transaction's amount or date, or undo it.
//
// A transaction row is a LOG. The money itself is derived from the source
// records (WalletInvestment, ProfitRecord, the wallet's opening/withdrawn
// fields), so changing the row alone would leave the balance disagreeing with
// the ledger. Every change here is therefore made to the source record and the
// transaction in one database transaction, followed by syncWallet.
//
// Supported, because each has exactly one source of truth to move:
//   INVESTMENT                  -> its WalletInvestment (+ the project's raised total)
//   PROFIT  (monthly, one-time,
//            insurance)         -> its ProfitRecord
//   ADMIN_CREDIT / ADMIN_DEBIT  -> the wallet's opening profit / withdrawn fields
// Anything else (withdrawals, capital returns, profit adjustments) is refused
// with a message, not half-handled.
//
// UNDO puts the source back to what it was before the transaction existed and
// marks the row REVERSED (kept, never deleted, so the history still shows it):
//   INVESTMENT -> the investment is CANCELLED and the project's raised total drops
//   PROFIT     -> the profit record is kept at 0, NOT deleted: deleting it would
//                 free its cycle and the monthly job would simply credit it again
//   ADMIN_*    -> the wallet field moves back
// Both refuse to leave a member with negative available profit.
const prisma = require('../utils/prismaClient');
const walletService = require('./walletService');
const { logActivity } = require('./activityLog');
const { recordChange } = require('./auditTrail');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Which source record backs a transaction, or why it cannot be changed here. */
function kindOf(tx) {
  if (tx.category === 'INVESTMENT' && tx.investmentId) return 'INVESTMENT';
  if (tx.category === 'PROFIT' && tx.profitRecordId) return 'PROFIT';
  if (tx.category === 'ADMIN_CREDIT') return 'ADMIN_CREDIT';
  if (tx.category === 'ADMIN_DEBIT') return 'ADMIN_DEBIT';
  return null;
}

const UNSUPPORTED = 'This kind of transaction cannot be edited or undone here, because its balance comes from a request or a capital return. '
  + 'Withdrawals can be reversed with the reverse action instead.';

async function load(id) {
  const tx = await prisma.transaction.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, deletedAt: true } } } });
  if (!tx) throw fail('Transaction not found', 404);
  if (tx.user?.deletedAt) throw fail('This member has been deleted', 400);
  if (tx.status === 'REVERSED') throw fail('This transaction has already been undone', 409);
  if (tx.status !== 'COMPLETED') throw fail('Only completed transactions can be changed', 400);
  const kind = kindOf(tx);
  if (!kind) throw fail(UNSUPPORTED);
  return { tx, kind };
}

/** Refuse a change that would leave less profit available than has already left. */
async function assertAvailableProfit(client, userId, what) {
  const b = await walletService.getWalletBreakdown(userId, client);
  if (b.availableProfit < -0.005) {
    throw fail(`${what} would leave this member with negative available profit (${b.availableProfit}). Part of that profit has already been withdrawn or reserved.`);
  }
}

async function finish({ tx, action, before, after, reason, actor, title, description }) {
  await recordChange({
    actor, action, targetId: tx.userId, before, after,
    extra: { transactionId: tx.id, reference: tx.reference, category: tx.category, reason },
  });
  logActivity({
    type: action === 'SA_UNDO_TRANSACTION' ? 'TRANSACTION_UNDONE' : 'TRANSACTION_EDITED',
    title, description: `${description}${reason ? ` — ${reason}` : ''}`,
    actorId: actor.id, actorName: actor.name, targetId: tx.userId, targetName: tx.user?.name,
    amount: tx.amount, metadata: { transactionId: tx.id, reference: tx.reference, category: tx.category, before, after, reason },
  });
}

async function edit({ id, amount, date, reason, actor }) {
  if (!reason || String(reason).trim().length < 3) throw fail('A reason is required');
  const { tx, kind } = await load(id);

  const wantsAmount = amount !== undefined && amount !== null && amount !== '';
  const newAmount = wantsAmount ? money(parseFloat(amount)) : tx.amount;
  if (wantsAmount && !(newAmount > 0)) throw fail('Amount must be greater than zero');
  const newDate = date ? parseDay(date) : null;
  if (date && !newDate) throw fail('A valid date is required');
  if (newDate && newDate > new Date()) throw fail('The date cannot be in the future');
  const amountChanged = wantsAmount && newAmount !== tx.amount;
  if (!amountChanged && !newDate) throw fail('Nothing to change');
  const delta = money(newAmount - tx.amount);

  const before = { amount: tx.amount, date: dayKey(tx.createdAt) };
  const after = { amount: newAmount, date: newDate ? dayKey(newDate) : before.date };

  const updated = await prisma.$transaction(async (db) => {
    const when = newDate || undefined;

    if (kind === 'INVESTMENT') {
      const inv = await db.walletInvestment.findUnique({ where: { id: tx.investmentId } });
      if (!inv || inv.status !== 'ACTIVE') throw fail('This investment is no longer active');
      if (newAmount < (inv.returnedAmount || 0)) throw fail(`Amount cannot be below the capital already returned (${inv.returnedAmount})`);
      await db.walletInvestment.update({ where: { id: inv.id }, data: { amount: newAmount, ...(when ? { investedAt: when } : {}) } });
      if (delta !== 0 && inv.projectId) {
        await db.project.update({ where: { id: inv.projectId }, data: { raisedAmount: { increment: delta } } });
      }
    } else if (kind === 'PROFIT') {
      await db.profitRecord.update({ where: { id: tx.profitRecordId }, data: { amount: newAmount, ...(when ? { generatedAt: when } : {}) } });
    } else if (delta !== 0) {
      // Opening-balance adjustments: a credit raised profitAmount, a debit raised withdrawnProfit.
      await db.wallet.update({
        where: { userId: tx.userId },
        data: kind === 'ADMIN_CREDIT' ? { profitAmount: { increment: delta } } : { withdrawnProfit: { increment: delta } },
      });
    }

    const row = await db.transaction.update({
      where: { id: tx.id }, data: { amount: newAmount, ...(when ? { createdAt: when } : {}) },
    });
    const b = await walletService.syncWallet(tx.userId, db);
    if (kind !== 'INVESTMENT' && delta !== 0) await assertAvailableProfit(db, tx.userId, 'This change');
    return { row, b };
  });

  await finish({
    tx, action: 'SA_EDIT_TRANSACTION', before, after, reason, actor,
    title: `Transaction edited · ${tx.user?.name || ''}`.trim(),
    description: `${tx.category}: ${before.amount} → ${after.amount}, ${before.date} → ${after.date}`,
  });
  return updated.row;
}

async function undo({ id, reason, actor }) {
  if (!reason || String(reason).trim().length < 3) throw fail('A reason is required');
  const { tx, kind } = await load(id);
  const before = { amount: tx.amount, status: tx.status };

  const row = await prisma.$transaction(async (db) => {
    if (kind === 'INVESTMENT') {
      const inv = await db.walletInvestment.findUnique({ where: { id: tx.investmentId } });
      if (!inv || inv.status !== 'ACTIVE') throw fail('This investment is no longer active');
      if ((inv.returnedAmount || 0) > 0) throw fail('Part of this capital has already been returned, so the investment cannot be undone');
      await db.walletInvestment.update({ where: { id: inv.id }, data: { status: 'CANCELLED' } });
      if (inv.projectId) await db.project.update({ where: { id: inv.projectId }, data: { raisedAmount: { decrement: inv.amount } } });
    } else if (kind === 'PROFIT') {
      // Kept at zero rather than deleted - see the header.
      await db.profitRecord.update({ where: { id: tx.profitRecordId }, data: { amount: 0 } });
    } else {
      await db.wallet.update({
        where: { userId: tx.userId },
        data: kind === 'ADMIN_CREDIT' ? { profitAmount: { decrement: tx.amount } } : { withdrawnProfit: { decrement: tx.amount } },
      });
    }
    const updated = await db.transaction.update({ where: { id: tx.id }, data: { status: 'REVERSED' } });
    await walletService.syncWallet(tx.userId, db);
    if (kind !== 'INVESTMENT' && !(kind === 'ADMIN_DEBIT')) await assertAvailableProfit(db, tx.userId, 'Undoing this');
    return updated;
  });

  await finish({
    tx, action: 'SA_UNDO_TRANSACTION', before, after: { status: 'REVERSED' }, reason, actor,
    title: `Transaction undone · ${tx.user?.name || ''}`.trim(),
    description: `${tx.category} ${tx.amount} reversed`,
  });
  return row;
}

module.exports = { edit, undo, kindOf };
