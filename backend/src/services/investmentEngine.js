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
const notifier = require('./notifier');

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

async function setMonthlyProfitConfig({ userId, projectId, rate, fixedAmount, monthlyProfitDay = 15, effectiveFrom, createdBy }) {
  if (!userId) throw badRequest('User is required');
  const day = parseInt(monthlyProfitDay, 10);
  if (!(day >= 1 && day <= 31)) throw badRequest('Profit day must be between 1 and 31');

  const hasAmount = fixedAmount !== undefined && fixedAmount !== null && fixedAmount !== '';
  const hasRate = rate !== undefined && rate !== null && rate !== '';
  if (hasAmount === hasRate) throw badRequest('Provide either a monthly percentage or a fixed amount');

  const project = await resolveProject(projectId);
  let r;
  let amt = null;
  if (hasAmount) {
    amt = money(parseFloat(fixedAmount));
    if (Number.isNaN(amt) || amt <= 0) throw badRequest('Monthly amount must be greater than zero');
    // The equivalent % is informational (reports, the rate column). 0 when
    // there is no capital to express it against yet.
    const capital = await getTotalCapital(userId, project?.id || null);
    r = capital > 0 ? Math.round((amt / capital) * 10000) / 100 : 0;
  } else {
    r = parseFloat(rate);
    if (Number.isNaN(r) || r <= 0) throw badRequest('Monthly rate must be greater than zero');
  }
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
        fixedAmount: amt,
        monthlyProfitDay: day,
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

/** What a config credits for a cycle: its fixed amount, or its % of eligible capital. */
const monthlyAmountFor = (config, eligibleCapital) =>
  config.fixedAmount != null ? money(config.fixedAmount) : money(eligibleCapital * config.rate / 100);

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

/**
 * Preview for the monthly fix: capital, the config in force (if any), the
 * capital that will be eligible on the next cycle and what that credits.
 * `day` previews a day the admin is typing; it defaults to the config's own.
 */
async function previewMonthlyProfit(userId, projectId, day) {
  const [capital, config] = await Promise.all([
    getTotalCapital(userId, projectId),
    getCurrentMonthlyProfitConfig(userId, projectId),
  ]);
  const cycleDay = parseInt(day, 10) || config?.monthlyProfitDay || 15;

  const now = new Date();
  const at = (offset) => {
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate();
    return new Date(now.getFullYear(), now.getMonth() + offset, Math.min(cycleDay, last));
  };
  const next = at(0) > now ? at(0) : at(1);

  const eligibleCapital = await getEligibleCapitalForDate(userId, projectId, next, cycleDay);
  const monthlyAmount = !config ? 0
    : eligibleCapital > 0 ? monthlyAmountFor(config, eligibleCapital) : 0;
  return {
    capital,
    eligibleCapital,
    config: config ? {
      rate: config.rate, fixedAmount: config.fixedAmount ?? null,
      monthlyProfitDay: config.monthlyProfitDay, effectiveFrom: config.effectiveFrom,
    } : null,
    rate: config ? config.rate : null,
    monthlyAmount,
    nextProfitDate: next,
  };
}

/**
 * Every active monthly fix a member has, with what it would credit on its next
 * cycle - recomputed from the capital the member holds right now, so a booking
 * made a minute ago is already in the figure. Capital invested after a cycle's
 * cut-off counts from the following cycle (the eligibility rule above), which
 * is why `capital` (all of it) and `eligibleCapital` (what the next credit is
 * calculated on) can differ.
 */
async function monthlyPlansForUser(userId) {
  const configs = await prisma.profitConfig.findMany({
    where: { userId, profitType: 'MONTHLY_PERCENT', active: true },
    include: { project: { select: { title: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  const now = new Date();
  const plans = [];
  for (const c of configs) {
    const at = (offset) => {
      const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate();
      return new Date(now.getFullYear(), now.getMonth() + offset, Math.min(c.monthlyProfitDay, last));
    };
    const next = at(0) > now ? at(0) : at(1);
    const [capital, eligibleCapital] = await Promise.all([
      getTotalCapital(userId, c.projectId),
      getEligibleCapitalForDate(userId, c.projectId, next, c.monthlyProfitDay),
    ]);
    plans.push({
      id: c.id, projectId: c.projectId, project: c.project?.title || null,
      rate: c.rate, fixedAmount: c.fixedAmount ?? null, monthlyProfitDay: c.monthlyProfitDay,
      nextDate: next, capital, eligibleCapital,
      expectedAmount: eligibleCapital > 0 ? monthlyAmountFor(c, eligibleCapital) : 0,
    });
  }
  return plans;
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

  notifier.notify([userId], {
    type: 'PROFIT_DISTRIBUTED', title: 'Profit credited',
    message: `€${Number(record.amount).toLocaleString()} profit was added to your wallet${project?.title ? ` from ${project.title}` : ''}.`,
    link: '/dashboard',
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

  const amount = monthlyAmountFor(config, eligibleCapital);
  // A fixed amount is recorded with the % it works out to on this cycle's capital.
  const appliedRate = config.fixedAmount != null ? Math.round((amount / eligibleCapital) * 10000) / 100 : config.rate;
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
          rate: appliedRate,
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
          profitRate: appliedRate,
          profitRecordId: rec.id,
          createdBy: createdBy || 'system',
          createdAt: periodDate,
        },
      });

      await walletService.syncWallet(userId, tx);
      return rec;
    });

    notifier.notify([userId], {
      type: 'PROFIT_DISTRIBUTED', title: 'Monthly profit credited',
      message: `€${Number(record.amount).toLocaleString()} profit for ${key} was added to your wallet${project?.title ? ` from ${project.title}` : ''}.`,
      link: '/dashboard',
    });

    notifyMember(async () => {
      const user = await memberFor(userId);
      if (user?.email) {
        await mailer.sendProfitStatementEmail({
          user,
          amount: record.amount,
          projectTitle: project?.title || null,
          rate: appliedRate,
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

/**
 * The scheduled run: for every active monthly config, credit each cycle whose
 * configured day has arrived - this month's, and last month's in case the API
 * was down on the day. Idempotent (unique cycle row), so running hourly, twice
 * or from two processes can never pay a cycle twice or email it twice.
 */
async function generateDueMonthlyProfits(now = new Date(), createdBy = 'system') {
  const configs = await prisma.profitConfig.findMany({
    where: { profitType: 'MONTHLY_PERCENT', active: true, effectiveFrom: { lte: now } },
    select: { userId: true, projectId: true, monthlyProfitDay: true },
  });

  const credited = [];
  for (const { userId, projectId, monthlyProfitDay } of configs) {
    for (const monthOffset of [-1, 0]) {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0).getDate();
      const cycle = new Date(now.getFullYear(), now.getMonth() + monthOffset, Math.min(monthlyProfitDay, lastDay));
      if (cycle > now) continue;
      try {
        const res = await computeMonthlyProfitForPeriod({ userId, projectId, periodDate: cycle, createdBy });
        if (res.generated) credited.push(res.record);
      } catch (err) {
        console.error(`[monthly-profit] ${userId}/${projectId || '-'} ${periodKey(cycle)}:`, err.message);
      }
    }
  }
  return { generated: credited.length, credited, checked: configs.length };
}

module.exports = {
  generateDueMonthlyProfits,
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
  monthlyAmountFor,
  monthlyPlansForUser,
  previewMonthlyProfit,
  createOneTimeProfit,
  computeMonthlyProfitForPeriod,
  generateMonthlyProfitsForPeriod,
};
