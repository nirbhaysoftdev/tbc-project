// src/services/walletService.js
//
// The single place balances are derived. Deal Room / investment / profit /
// withdrawal are views of one ledger, so nothing computes a balance on its own:
//
//   project investment (capital)  ─┐
//   profit records (profit)        ├─> wallet buckets ─> transactions ─> charts
//   withdrawal reservations        ─┘
//
// A member's balance is the manual OPENING BALANCE (Wallet.investmentAmount /
// profitAmount - set by the legacy admin tools, with no project behind it) plus
// the derived project ledger. Production wallets are entirely opening balance
// today; admin migrates them onto real project investments one at a time, and
// both halves stay correct throughout.
//
// A project is OPTIONAL on an investment. Capital with no project is a fully
// supported, permanent case - not a legacy artifact.

const prisma = require('../utils/prismaClient');

const NO_PROJECT = 'NO_PROJECT';

/** Uniqueness scope for profit cycles; see ProfitRecord.scopeKey in the schema. */
const scopeKeyFor = (projectId) => projectId || NO_PROJECT;

/** Currency-safe rounding - avoids 0.1 + 0.2 drift accumulating across a ledger. */
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Live capital of one investment row: the part that has not been returned. */
const liveCapital = (inv) => Math.max(0, inv.amount - (inv.returnedAmount || 0));

/**
 * Capital and profit derived from the project ledger, ignoring the opening
 * balance. `client` lets callers run this inside an open $transaction.
 */
async function getLedgerTotals(userId, client = prisma) {
  const [investments, profitRecords] = await Promise.all([
    client.walletInvestment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { amount: true, returnedAmount: true },
    }),
    client.profitRecord.findMany({
      where: { userId },
      select: { amount: true },
    }),
  ]);

  return {
    projectCapital: money(investments.reduce((sum, inv) => sum + liveCapital(inv), 0)),
    projectProfit: money(profitRecords.reduce((sum, rec) => sum + rec.amount, 0)),
  };
}

/**
 * Combine a wallet's opening balance with its project ledger. The one place
 * the balance formula lives - every read path goes through this.
 */
function composeBreakdown(wallet, projectCapital, projectProfit) {
  const openingCapital = wallet?.investmentAmount || 0;
  const openingProfit = wallet?.profitAmount || 0;
  const pendingWithdrawal = wallet?.pendingWithdrawal || 0;
  const withdrawnProfit = wallet?.withdrawnProfit || 0;

  const investedCapital = money(openingCapital + projectCapital);
  const grossProfit = money(openingProfit + projectProfit);
  const availableProfit = money(grossProfit - withdrawnProfit - pendingWithdrawal);

  return {
    openingCapital,
    openingProfit,
    projectCapital: money(projectCapital),
    projectProfit: money(projectProfit),
    investedCapital,
    grossProfit,
    availableProfit,
    pendingWithdrawal,
    withdrawnProfit,
    totalBalance: money(investedCapital + availableProfit),
    currency: wallet?.currency || 'EUR',
    frozen: wallet?.frozen || false,
    lastUpdated: wallet?.lastUpdated || null,
    exists: Boolean(wallet),
  };
}

/**
 * The full wallet picture. Invested capital is never withdrawable - only
 * availableProfit is, and a pending withdrawal request reserves against it so
 * the same profit cannot be requested twice.
 */
async function getWalletBreakdown(userId, client = prisma) {
  const [wallet, ledger] = await Promise.all([
    client.wallet.findUnique({ where: { userId } }),
    getLedgerTotals(userId, client),
  ]);

  return composeBreakdown(wallet, ledger.projectCapital, ledger.projectProfit);
}

/**
 * Breakdowns for many users in a fixed number of queries, for list and
 * aggregate views. Returns a Map keyed by userId.
 */
async function getWalletBreakdownsFor(userIds, client = prisma) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [wallets, investments, profitRecords] = await Promise.all([
    client.wallet.findMany({ where: { userId: { in: ids } } }),
    client.walletInvestment.findMany({
      where: { userId: { in: ids }, status: 'ACTIVE' },
      select: { userId: true, amount: true, returnedAmount: true },
    }),
    client.profitRecord.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, amount: true },
    }),
  ]);

  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));
  const capitalByUser = new Map();
  const profitByUser = new Map();
  investments.forEach((inv) => {
    capitalByUser.set(inv.userId, (capitalByUser.get(inv.userId) || 0) + liveCapital(inv));
  });
  profitRecords.forEach((rec) => {
    profitByUser.set(rec.userId, (profitByUser.get(rec.userId) || 0) + rec.amount);
  });

  return new Map(ids.map((id) => [
    id,
    composeBreakdown(walletByUser.get(id), capitalByUser.get(id) || 0, profitByUser.get(id) || 0),
  ]));
}

/**
 * A wallet object safe to hand to any client: the stored row with its capital
 * and profit fields replaced by the derived values. Keeps the legacy
 * investmentAmount / profitAmount field names working for existing screens
 * while making them mean invested capital and available profit.
 */
function presentWallet(wallet, breakdown) {
  if (!wallet && !breakdown?.exists) return null;
  return {
    ...wallet,
    ...breakdown,
    investmentAmount: breakdown.investedCapital,
    profitAmount: breakdown.availableProfit,
    totalBalance: breakdown.totalBalance,
  };
}

/**
 * Recompute and persist the cached total. Call inside the same $transaction as
 * any ledger write (investment, profit, withdrawal, capital return, legacy
 * admin adjustment) so the cache can never drift from the ledger.
 *
 * Only `totalBalance` is a cache. investmentAmount/profitAmount are the opening
 * balance and pendingWithdrawal/withdrawnProfit are the withdrawal buckets -
 * all four are written by their own flows and read as source data here.
 */
async function syncWallet(userId, client = prisma) {
  const breakdown = await getWalletBreakdown(userId, client);
  if (!breakdown.exists) return breakdown;

  await client.wallet.update({
    where: { userId },
    data: { totalBalance: breakdown.totalBalance },
  });

  return breakdown;
}

/**
 * Per-project capital and profit, so a member's money is always traceable to
 * the project that produced it. Project-less capital is reported under a single
 * "No project" row rather than being hidden.
 */
async function getProjectBreakdown(userId, client = prisma) {
  const [investments, profitRecords] = await Promise.all([
    client.walletInvestment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        amount: true,
        returnedAmount: true,
        projectId: true,
        project: { select: { id: true, title: true, category: true, status: true } },
      },
    }),
    client.profitRecord.findMany({
      where: { userId },
      select: {
        amount: true,
        projectId: true,
        project: { select: { id: true, title: true, category: true, status: true } },
      },
    }),
  ]);

  const rows = new Map();
  const rowFor = (projectId, project) => {
    const key = scopeKeyFor(projectId);
    if (!rows.has(key)) {
      rows.set(key, {
        projectId: projectId || null,
        projectTitle: project?.title || 'No project',
        category: project?.category || null,
        status: project?.status || null,
        capital: 0,
        profit: 0,
      });
    }
    return rows.get(key);
  };

  investments.forEach((inv) => {
    rowFor(inv.projectId, inv.project).capital += liveCapital(inv);
  });
  profitRecords.forEach((rec) => {
    rowFor(rec.projectId, rec.project).profit += rec.amount;
  });

  return [...rows.values()]
    .map((row) => ({ ...row, capital: money(row.capital), profit: money(row.profit) }))
    .sort((a, b) => b.capital - a.capital || a.projectTitle.localeCompare(b.projectTitle));
}

module.exports = {
  NO_PROJECT,
  scopeKeyFor,
  money,
  composeBreakdown,
  getLedgerTotals,
  getWalletBreakdown,
  getWalletBreakdownsFor,
  presentWallet,
  syncWallet,
  getProjectBreakdown,
};
