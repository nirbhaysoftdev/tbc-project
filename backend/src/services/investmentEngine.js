// src/services/investmentEngine.js
//
// Core calculation engine for the capital + profit system behind the member
// wallet. Projects come from the Deal Room (`Project`); there is no separate
// investment project catalogue.
//
// Rules this file enforces:
//   - A project is OPTIONAL. Capital with no project is fully supported and
//     earns profit the same way; it is grouped under the "NO_PROJECT" scope.
//   - Capital invested never grows on its own; only an explicit new
//     WalletInvestment row increases it, and only a capital return reduces it.
//   - Monthly profit is always `eligibleCapital * rate / 100` - it NEVER
//     compounds on top of previously generated profit.
//   - A fresh investment (or additional capital into an existing project)
//     only becomes "eligible" for monthly profit starting the configured day
//     (default the 15th) of the month AFTER the month it was invested in.
//     There is no daily proration for the first partial month, regardless of
//     which day within that month the investment landed on.
//   - Each monthly cycle is identified by a unique (userId, scopeKey, period)
//     key, enforced at the DB level, so the generator can run more than once
//     without ever double-paying a cycle.
//   - A rate change takes effect from the next cycle onward; past
//     ProfitRecords keep whatever rate actually produced them.
//   - Every write that moves money calls walletService.syncWallet in the same
//     transaction, so wallet, transactions and dashboards cannot drift apart.

const prisma = require('../utils/prismaClient');
const walletService = require('./walletService');
const mailer = require('./mailer');

/**
 * Send a member document after the money has actually been committed. Fire and
 * forget on purpose: a mail failure must never roll back or block a financial
 * record, so it is logged and swallowed.
 */
function notifyMember(send, context) {
  Promise.resolve()
    .then(send)
    .catch((e) => console.error(`member email failed (${context}):`, e.message));
}

async function memberFor(userId, client = prisma) {
  return client.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true,
      profile: { select: { billingAddress: true, businessAddress: true, vatNumber: true, city: true, country: true } },
    },
  });
}

const { scopeKeyFor, money } = walletService;

const pad2 = (n) => String(n).padStart(2, '0');

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = (message) => Object.assign(new Error(message), { status: 404 });

/**
 * Run `fn` inside the caller's open transaction when given one, otherwise open
 * a fresh one. Lets a caller compose an engine write with its own updates and
 * still have the whole thing commit or roll back together.
 */
const runInTransaction = (client, fn) => (client ? fn(client) : prisma.$transaction(fn));

/** "YYYY-MM-DD" cycle key for a monthly profit period. */
function periodKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * The first monthly cycle date an investment is eligible for: the configured
 * day (default 15th) of the month AFTER the investment's own calendar month -
 * regardless of which day of that month the investment landed on.
 */
function firstEligibleCycleDate(investedAt, monthlyProfitDay = 15) {
  const d = new Date(investedAt);
  return new Date(d.getFullYear(), d.getMonth() + 1, monthlyProfitDay);
}

/**
 * Deal-room project for an optional id. Returns null for project-less capital,
 * and throws only when an id was given but matches nothing.
 */
async function resolveProject(projectId, client = prisma) {
  if (!projectId) return null;
  const project = await client.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Project not found');
  return project;
}

const projectLabel = (project) => project?.title || 'general investment';

// ── Capital ────────────────────────────────────

/** Total capital currently invested (ACTIVE only), regardless of profit eligibility. */
async function getTotalCapital(userId, projectId, client = prisma) {
  const investments = await client.walletInvestment.findMany({
    where: { userId, projectId: projectId || null, status: 'ACTIVE' },
    select: { amount: true, returnedAmount: true },
  });
  return money(investments.reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.returnedAmount || 0)), 0));
}

/** Capital eligible to earn profit for a given monthly cycle date. */
async function getEligibleCapitalForDate(userId, projectId, asOfDate, monthlyProfitDay = 15, client = prisma) {
  const investments = await client.walletInvestment.findMany({
    where: { userId, projectId: projectId || null, status: 'ACTIVE' },
    select: { amount: true, returnedAmount: true, investedAt: true },
  });
  return money(investments.reduce((sum, inv) => {
    const eligibleFrom = firstEligibleCycleDate(inv.investedAt, monthlyProfitDay);
    if (eligibleFrom > asOfDate) return sum;
    return sum + Math.max(0, inv.amount - (inv.returnedAmount || 0));
  }, 0));
}

// ── Investments ────────────────────────────────

/**
 * Record capital for a user, optionally against a deal-room project. Creates
 * the investment, its INVESTMENT transaction, bumps the project's raised total
 * and refreshes the wallet - all in one transaction.
 */
async function createInvestment({ userId, projectId, amount, investedAt, createdBy, description, requestId }, client = null) {
  const amt = parseFloat(amount);
  if (!userId) throw badRequest('User is required');
  if (!amt || amt <= 0) throw badRequest('Investment amount must be greater than zero');

  const project = await resolveProject(projectId, client || prisma);
  const when = investedAt ? new Date(investedAt) : new Date();

  // When a caller passes its own transaction we are only part of its unit of
  // work, so it owns sending the invoice once ITS transaction commits.
  const ownsTransaction = !client;

  const investment = await runInTransaction(client, async (tx) => {
    const created = await tx.walletInvestment.create({
      data: {
        userId,
        projectId: project?.id || null,
        requestId: requestId || null,
        amount: money(amt),
        investedAt: when,
        status: 'ACTIVE',
        createdBy,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'CREDIT',
        category: 'INVESTMENT',
        description: description || `Investment - ${projectLabel(project)}`,
        amount: money(amt),
        status: 'COMPLETED',
        projectId: project?.id || null,
        investmentId: created.id,
        createdBy,
        createdAt: when,
      },
    });

    if (project) {
      await tx.project.update({
        where: { id: project.id },
        data: { raisedAmount: { increment: money(amt) } },
      });
    }

    await walletService.syncWallet(userId, tx);
    return created;
  });

  if (ownsTransaction) {
    notifyMember(async () => {
      const user = await memberFor(userId);
      if (user?.email) {
        await mailer.sendInvestmentInvoiceEmail({
          user,
          amount: investment.amount,
          projectTitle: project?.title || null,
          investedAt: investment.investedAt,
          investmentId: investment.id,
        });
      }
    }, `investment invoice ${investment.id}`);
  }

  return investment;
}

/**
 * Return capital to a member (admin only). Member withdrawals can never touch
 * capital, so this is the one path that reduces it. Supports partial returns:
 * the original row is kept and `returnedAmount` grows, so history stays intact.
 */
async function returnCapital({ investmentId, amount, createdBy, description }) {
  const investment = await prisma.walletInvestment.findUnique({
    where: { id: investmentId },
    include: { project: true },
  });
  if (!investment) throw notFound('Investment not found');

  const outstanding = money(investment.amount - (investment.returnedAmount || 0));
  if (outstanding <= 0) throw badRequest('This investment has already been returned in full');

  const amt = amount === undefined || amount === null || amount === '' ? outstanding : parseFloat(amount);
  if (!amt || amt <= 0) throw badRequest('Return amount must be greater than zero');
  if (amt > outstanding) {
    throw badRequest(`Return amount exceeds the outstanding capital of ${outstanding}`);
  }

  const returnedTotal = money((investment.returnedAmount || 0) + amt);
  const fullyReturned = returnedTotal >= investment.amount;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.walletInvestment.update({
      where: { id: investment.id },
      data: {
        returnedAmount: returnedTotal,
        status: fullyReturned ? 'RETURNED' : 'ACTIVE',
      },
    });

    await tx.transaction.create({
      data: {
        userId: investment.userId,
        type: 'DEBIT',
        category: 'CAPITAL_RETURN',
        description: description || `Capital return - ${projectLabel(investment.project)}`,
        amount: money(amt),
        status: 'COMPLETED',
        projectId: investment.projectId,
        investmentId: investment.id,
        createdBy,
      },
    });

    if (investment.projectId) {
      await tx.project.update({
        where: { id: investment.projectId },
        data: { raisedAmount: { decrement: money(amt) } },
      });
    }

    await walletService.syncWallet(investment.userId, tx);
    return updated;
  });
}

// ── Monthly profit configuration ───────────────

async function setMonthlyProfitConfig({ userId, projectId, rate, monthlyProfitDay = 15, effectiveFrom, createdBy }) {
  const r = parseFloat(rate);
  if (!userId) throw badRequest('User is required');
  if (Number.isNaN(r) || r <= 0) throw badRequest('Monthly rate must be greater than zero');

  const project = await resolveProject(projectId);
  const from = effectiveFrom ? new Date(effectiveFrom) : new Date();

  return prisma.$transaction(async (tx) => {
    // Rate changes take effect from the next cycle onward; past ProfitRecords
    // already reference the rate that produced them, so we only need to stop
    // treating the old config row as "current".
    await tx.profitConfig.updateMany({
      where: { userId, projectId: project?.id || null, profitType: 'MONTHLY_PERCENT', active: true },
      data: { active: false },
    });

    return tx.profitConfig.create({
      data: {
        userId,
        projectId: project?.id || null,
        profitType: 'MONTHLY_PERCENT',
        rate: r,
        monthlyProfitDay,
        effectiveFrom: from,
        active: true,
        createdBy,
      },
    });
  });
}

async function getCurrentMonthlyProfitConfig(userId, projectId, client = prisma) {
  return client.profitConfig.findFirst({
    where: { userId, projectId: projectId || null, profitType: 'MONTHLY_PERCENT', active: true },
    orderBy: { effectiveFrom: 'desc' },
  });
}

/** The config whose rate actually applies to a given cycle date (may be inactive now). */
async function getApplicableMonthlyConfig(userId, projectId, asOfDate, client = prisma) {
  return client.profitConfig.findFirst({
    where: {
      userId,
      projectId: projectId || null,
      profitType: 'MONTHLY_PERCENT',
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}

/** Preview card data: current capital, rate, computed monthly amount, next cycle date. */
async function previewMonthlyProfit(userId, projectId) {
  const [capital, config] = await Promise.all([
    getTotalCapital(userId, projectId),
    getCurrentMonthlyProfitConfig(userId, projectId),
  ]);
  if (!config) return { capital, rate: null, monthlyAmount: 0, nextProfitDate: null };

  const now = new Date();
  const day = config.monthlyProfitDay;
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, day);

  const eligibleCapital = await getEligibleCapitalForDate(userId, projectId, next, day);
  return {
    capital,
    rate: config.rate,
    monthlyAmount: money(eligibleCapital * config.rate / 100),
    nextProfitDate: next,
  };
}

// ── One-time profit ─────────────────────────────

async function createOneTimeProfit({ userId, projectId, profitType, value, effectiveDate, createdBy, description }) {
  if (!['ONE_TIME_AMOUNT', 'ONE_TIME_PERCENT'].includes(profitType)) {
    throw badRequest('profitType must be ONE_TIME_AMOUNT or ONE_TIME_PERCENT');
  }
  const v = parseFloat(value);
  if (Number.isNaN(v) || v <= 0) throw badRequest('Amount/percentage must be greater than zero');

  const project = await resolveProject(projectId);
  const capital = await getTotalCapital(userId, projectId);
  const amount = profitType === 'ONE_TIME_PERCENT' ? money(capital * v / 100) : money(v);
  const rate = profitType === 'ONE_TIME_PERCENT' ? v : null;
  const when = effectiveDate ? new Date(effectiveDate) : new Date();

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.profitRecord.create({
      data: {
        userId,
        projectId: project?.id || null,
        scopeKey: scopeKeyFor(project?.id),
        type: 'ONE_TIME',
        period: `ONE_TIME-${require('crypto').randomUUID()}`,
        capitalSnapshot: capital,
        rate,
        amount,
        generatedAt: when,
        createdBy,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'CREDIT',
        category: 'PROFIT',
        description: description || `One-time profit - ${projectLabel(project)}`,
        amount,
        status: 'COMPLETED',
        projectId: project?.id || null,
        profitType,
        profitRate: rate,
        profitRecordId: created.id,
        createdBy,
        createdAt: when,
      },
    });

    await walletService.syncWallet(userId, tx);
    return created;
  });

  notifyMember(async () => {
    const user = await memberFor(userId);
    if (user?.email) {
      await mailer.sendProfitStatementEmail({
        user,
        amount: record.amount,
        projectTitle: project?.title || null,
        rate,
        capitalBase: capital,
        generatedAt: record.generatedAt,
        profitRecordId: record.id,
        isMonthly: false,
      });
    }
  }, `one-time profit statement ${record.id}`);

  return record;
}

// ── Monthly profit generation ───────────────────

/**
 * Generate (or skip, if already generated) the monthly profit for one
 * user+project cycle. Idempotent - safe to call repeatedly for the same
 * period, including concurrently, thanks to the DB unique constraint.
 */
async function computeMonthlyProfitForPeriod({ userId, projectId, periodDate, createdBy }) {
  const key = periodKey(periodDate);
  const scopeKey = scopeKeyFor(projectId);
  const cycle = { userId_scopeKey_period: { userId, scopeKey, period: key } };

  const existing = await prisma.profitRecord.findUnique({ where: cycle });
  if (existing) return { record: existing, generated: false };

  const config = await getApplicableMonthlyConfig(userId, projectId, periodDate);
  if (!config) return { record: null, generated: false };

  const eligibleCapital = await getEligibleCapitalForDate(userId, projectId, periodDate, config.monthlyProfitDay);
  if (eligibleCapital <= 0) return { record: null, generated: false };

  const amount = money(eligibleCapital * config.rate / 100);
  const project = projectId ? await prisma.project.findUnique({ where: { id: projectId } }) : null;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const rec = await tx.profitRecord.create({
        data: {
          userId,
          projectId: projectId || null,
          scopeKey,
          type: 'MONTHLY',
          period: key,
          capitalSnapshot: eligibleCapital,
          rate: config.rate,
          amount,
          generatedAt: periodDate,
          createdBy: createdBy || 'system',
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'CREDIT',
          category: 'PROFIT',
          description: `Monthly profit (${key}) - ${projectLabel(project)}`,
          amount,
          status: 'COMPLETED',
          projectId: projectId || null,
          profitType: 'MONTHLY_PERCENT',
          profitRate: config.rate,
          profitRecordId: rec.id,
          createdBy: createdBy || 'system',
          createdAt: periodDate,
        },
      });

      await walletService.syncWallet(userId, tx);
      return rec;
    });

    notifyMember(async () => {
      const user = await memberFor(userId);
      if (user?.email) {
        await mailer.sendProfitStatementEmail({
          user,
          amount: record.amount,
          projectTitle: project?.title || null,
          rate: config.rate,
          capitalBase: eligibleCapital,
          period: key,
          generatedAt: record.generatedAt,
          profitRecordId: record.id,
          isMonthly: true,
        });
      }
    }, `monthly profit statement ${record.id}`);

    return { record, generated: true };
  } catch (err) {
    // Unique constraint race (two callers for the same cycle) - treat as already generated.
    if (err.code === 'P2002') {
      const rec = await prisma.profitRecord.findUnique({ where: cycle });
      return { record: rec, generated: false };
    }
    throw err;
  }
}

/** Run the monthly profit cycle for every user+project that has a monthly config as of this date. */
async function generateMonthlyProfitsForPeriod(periodDate = new Date(), createdBy = 'system') {
  const configs = await prisma.profitConfig.findMany({
    where: { profitType: 'MONTHLY_PERCENT', effectiveFrom: { lte: periodDate } },
    select: { userId: true, projectId: true },
    distinct: ['userId', 'projectId'],
  });

  const results = [];
  for (const { userId, projectId } of configs) {
    const res = await computeMonthlyProfitForPeriod({ userId, projectId, periodDate, createdBy });
    results.push({ userId, projectId, ...res });
  }
  return {
    period: periodKey(periodDate),
    generated: results.filter((r) => r.generated).length,
    skipped: results.filter((r) => !r.generated).length,
    results,
  };
}

module.exports = {
  periodKey,
  firstEligibleCycleDate,
  resolveProject,
  getTotalCapital,
  getEligibleCapitalForDate,
  createInvestment,
  returnCapital,
  setMonthlyProfitConfig,
  getCurrentMonthlyProfitConfig,
  getApplicableMonthlyConfig,
  previewMonthlyProfit,
  createOneTimeProfit,
  computeMonthlyProfitForPeriod,
  generateMonthlyProfitsForPeriod,
};
