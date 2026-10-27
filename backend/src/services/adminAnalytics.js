// src/services/adminAnalytics.js
//
// The numbers behind the admin Overview: what the portal is worth, what has
// been put in, what has been paid out, what is running, and how all of that
// moved over a chosen period.
//
// ONE LEDGER, ONE SOURCE. Every money figure here comes from the same places
// services/walletService.js derives a member's balance from - wallet opening
// balances, `wallet_investments`, `profit_records`, `transactions` - so the
// Overview can never disagree with a member's own wallet. Nothing is cached and
// nothing is denormalised: a figure that is stored separately is a figure that
// goes stale.
//
// THE DATED/UNDATED SPLIT, WHICH IS THE ONE SUBTLETY HERE. Opening balances
// (`wallets.investmentAmount` / `profitAmount`) are the legacy admin figures
// with no project and NO DATE - see the header of walletService. They are real
// money and belong in every "total to date", but they cannot be placed in a
// month, so they are excluded from anything bucketed by time and reported
// separately as `opening`. The alternative - stamping them with `createdAt` -
// would invent history and put a 2019 member's whole balance in the week their
// row was made. Every total therefore says which of the two it is:
//
//   total    = opening + dated ledger   (as of now; what the portal holds)
//   inRange  = dated ledger only        (what moved in the chosen period)
//
// WHAT `assets` HOLDS. Everything the portal holds today, in two parts that
// are reported separately because they are measured differently:
//
//   portfolio  what ACTIVE companies and projects are *worth* (`valuation`).
//              ACTIVE and nothing else: a DRAFT carries a figure typed while
//              drafting, and FUNDED/CLOSED/ARCHIVED are excluded by decision -
//              see ASSET_PROJECT_STATUS below.
//   wallets    the balance of every member's wallet, summed. Read straight
//              off `wallets.totalBalance`, which walletService.syncWallet
//              rewrites inside the same transaction as every ledger move, so
//              it is the same number the member sees on their own wallet.
//
//   total = portfolio + wallets
//
// The two halves do not double-count: a valuation is what an asset would
// fetch, a wallet balance is money the portal is holding for a member, and no
// row feeds both. `investment` is still NOT an asset line - it is the inflow
// that produced part of the wallet half, and adding it on top would count the
// same euros twice, which is why the screen keeps them apart.
//
// `byIndustry` and its shares cover the PORTFOLIO half only: a wallet has no
// industry, and folding it into one would invent a sector. Rows with no
// valuation are counted and reported rather than treated as zero, so
// "€4.2M across 11 of 14" cannot be misread as "€4.2M across 14".
const prisma = require('../utils/prismaClient');

/** Currency-safe rounding, as walletService does it. */
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Live capital of one investment row: the part that has not been returned. */
const liveCapital = (inv) => Math.max(0, inv.amount - (inv.returnedAmount || 0));

/**
 * Whose VALUATION counts towards the portfolio: ACTIVE only, for both models.
 *
 * DRAFT is the point of this being a whitelist - an unpublished project or
 * company carries a valuation an admin typed while drafting it, and nothing
 * says that figure was ever meant to be real. ARCHIVED, INACTIVE, CLOSED and
 * CANCELLED are excluded for the same reason from the other end: the portal
 * does not hold them any more.
 *
 * FUNDED is excluded DELIBERATELY, by decision rather than by oversight. A
 * fully-raised project is arguably still an asset the portal holds, so if the
 * Overview should count it again, this is the one line to change - and the
 * meter below keeps counting it either way.
 */
const ASSET_PROJECT_STATUS = ['ACTIVE'];
const ASSET_COMPANY_STATUS = ['ACTIVE'];

/**
 * Whose FUNDING PROGRESS is still live, for the raised-against-target meter.
 * A different question from the one above: a FUNDED project's raised amount is
 * real money that was really raised, and dropping it would make the meter
 * report less than members have actually put in.
 */
const LIVE_PROJECT_STATUS = ['ACTIVE', 'FUNDED'];
const LIVE_COMPANY_STATUS = ['ACTIVE'];

const RANGES = ['all', 'month', 'quarter', 'year', 'custom'];
const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];

/** At most this many buckets in a series, so a custom range cannot ask for 4000 points. */
const MAX_BUCKETS = 120;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/**
 * Turn the query string into a window and a bucket size.
 *
 * `all` has no lower bound: the first dated row in the database is the start,
 * and the caller is told what that turned out to be rather than being given a
 * chart that silently begins at an arbitrary date.
 */
function resolveRange({ range = 'all', from, to, granularity } = {}) {
  const key = RANGES.includes(String(range)) ? String(range) : 'all';
  const now = new Date();

  let start = null;
  let end = endOfDay(now);

  if (key === 'month') {
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  } else if (key === 'quarter') {
    start = startOfDay(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
  } else if (key === 'year') {
    start = startOfDay(new Date(now.getFullYear(), 0, 1));
  } else if (key === 'custom') {
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to) : null;
    if (!f || Number.isNaN(f.getTime())) {
      return { error: 'A custom range needs a valid `from` date.' };
    }
    if (t && Number.isNaN(t.getTime())) {
      return { error: '`to` must be a valid date.' };
    }
    start = startOfDay(f);
    end = t ? endOfDay(t) : endOfDay(now);
    if (start > end) return { error: '`from` must be before `to`.' };
  }

  // Auto granularity: roughly 10-40 buckets for any window, so the shape is
  // readable without the caller having to know what to ask for.
  let bucket = granularity && GRANULARITIES.includes(String(granularity))
    ? String(granularity)
    : null;

  if (!bucket) {
    const days = start ? Math.ceil((end - start) / 86400000) : null;
    if (days === null)      bucket = 'month';
    else if (days <= 45)    bucket = 'day';
    else if (days <= 120)   bucket = 'week';
    else if (days <= 1100)  bucket = 'month';
    else                    bucket = 'quarter';
  }

  return { key, from: start, to: end, granularity: bucket };
}

/** The label a date falls under, for the chosen bucket size. Sorts lexically. */
function bucketKey(date, granularity) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');

  switch (granularity) {
    case 'day':
      return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
    case 'week': {
      // ISO-ish: the Monday of the week, which keeps buckets contiguous and
      // comparable across months.
      const monday = new Date(d);
      const weekday = (d.getDay() + 6) % 7;
      monday.setDate(d.getDate() - weekday);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
    case 'quarter':
      return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case 'year':
      return String(y);
    case 'month':
    default:
      return `${y}-${m}`;
  }
}

/**
 * The date filter for the window, to be applied to whichever column dates the
 * row: `createdAt` on a transaction, `investedAt` on capital, `generatedAt` on
 * a profit record. `all` still has an upper bound, so a row dated in the future
 * never lands in a chart of the past.
 */
const inWindow = ({ from, to }) => {
  const filter = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return Object.keys(filter).length ? filter : undefined;
};

// ── Assets ────────────────────────────────────
//
// What the portal's ACTIVE companies and projects are valued at, split by the
// industry they are filed under, plus what sits in members' wallets.
//
// Companies and projects are kept apart inside each industry: they are
// different kinds of asset, and an admin asking "how much of our value is real
// estate?" still wants to know which half is which.
//
// The wallet half is one sum: `wallets.totalBalance` across every wallet. That
// column is walletService's own derived balance, rewritten by syncWallet inside
// the same transaction as every ledger write, so this is the sum of the figures
// members themselves see and cannot disagree with them.
async function assetsByIndustry() {
  const [companies, projects, wallets] = await Promise.all([
    prisma.company.findMany({
      where:  { status: { in: ASSET_COMPANY_STATUS } },
      select: { id: true, name: true, category: true, valuation: true },
    }),
    prisma.project.findMany({
      where:  { status: { in: ASSET_PROJECT_STATUS } },
      select: { id: true, title: true, category: true, valuation: true, targetAmount: true, raisedAmount: true },
    }),

    prisma.wallet.aggregate({
      _count: { _all: true },
      _sum: { totalBalance: true },
    }),
  ]);

  // Industries are free text on both models, so they are grouped
  // case-insensitively and the first spelling seen becomes the label. Two
  // records filed as "Real Estate" and "REAL_ESTATE" are one industry.
  const industries = new Map();
  const bump = (category, kind, value) => {
    const raw = (category || '').trim() || 'Uncategorised';
    const key = raw.toLowerCase().replace(/[\s_-]+/g, ' ');
    if (!industries.has(key)) {
      industries.set(key, { industry: raw, total: 0, companies: 0, projects: 0, companyValue: 0, projectValue: 0 });
    }
    const row = industries.get(key);
    row[kind === 'company' ? 'companies' : 'projects'] += 1;
    row[kind === 'company' ? 'companyValue' : 'projectValue'] += value;
    row.total += value;
  };

  let companyValue = 0;
  let companyUnvalued = 0;
  for (const c of companies) {
    const v = c.valuation || 0;
    if (!c.valuation) companyUnvalued += 1;
    companyValue += v;
    bump(c.category, 'company', v);
  }

  let projectValue = 0;
  let projectUnvalued = 0;
  let raised = 0;
  let target = 0;
  for (const p of projects) {
    const v = p.valuation || 0;
    if (!p.valuation) projectUnvalued += 1;
    projectValue += v;
    raised += p.raisedAmount || 0;
    target += p.targetAmount || 0;
    bump(p.category, 'project', v);
  }

  const portfolio = money(companyValue + projectValue);

  // The wallet half: the sum of the balances members themselves see. No
  // decomposition into capital and profit - the balance is the figure.
  const walletValue = money(wallets._sum.totalBalance || 0);

  const total = money(portfolio + walletValue);

  const byIndustry = [...industries.values()]
    .map((row) => ({
      ...row,
      total: money(row.total),
      companyValue: money(row.companyValue),
      projectValue: money(row.projectValue),
      // Share of the valued PORTFOLIO, not of `total`: this table does not
      // cover the wallet half, so its shares have to add up to 100 against
      // what it does cover. Zero when nothing is valued yet, rather than NaN
      // from dividing by nothing.
      share: portfolio > 0 ? Math.round((row.total / portfolio) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.industry.localeCompare(b.industry));

  return {
    total,
    // The valuation half on its own - what `byIndustry` sums to.
    portfolio,
    wallets: {
      count: wallets._count._all,
      value: walletValue,
    },
    companies: {
      count: companies.length,
      valued: companies.length - companyUnvalued,
      unvalued: companyUnvalued,
      value: money(companyValue),
    },
    projects: {
      count: projects.length,
      valued: projects.length - projectUnvalued,
      unvalued: projectUnvalued,
      value: money(projectValue),
      raised: money(raised),
      target: money(target),
    },
    byIndustry,
  };
}

// ── Projects ──────────────────────────────────
async function projectTotals() {
  const grouped = await prisma.project.groupBy({ by: ['status'], _count: { _all: true } });
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));

  const live = await prisma.project.aggregate({
    where: { status: { in: LIVE_PROJECT_STATUS } },
    _sum:  { targetAmount: true, raisedAmount: true },
  });

  const target = money(live._sum.targetAmount || 0);
  const raised = money(live._sum.raisedAmount || 0);

  return {
    running: byStatus.ACTIVE || 0,
    funded:  byStatus.FUNDED || 0,
    closed:  byStatus.CLOSED || 0,
    draft:   byStatus.DRAFT || 0,
    cancelled: byStatus.CANCELLED || 0,
    total: grouped.reduce((sum, g) => sum + g._count._all, 0),
    target,
    raised,
    // Raised against target across every live project. A meter, not a chart.
    fundingProgress: target > 0 ? Math.round((raised / target) * 1000) / 10 : 0,
  };
}

/**
 * Everything on one window.
 *
 * The three dated sources are read once each and bucketed in JS rather than in
 * SQL: Prisma cannot group by a truncated date without a raw query, and at this
 * portal's size (thousands of rows, not millions) one indexed scan is cheaper
 * than maintaining a rollup table that can disagree with the ledger.
 */
async function overview({ from, to, granularity }) {
  const window = inWindow({ from, to });

  const [
    assets, projects,
    openingWallets,
    liveInvestments, rangedInvestments,
    allProfit, rangedProfit,
    txTotals, rangedTx, txByCategory,
    members,
  ] = await Promise.all([
    assetsByIndustry(),
    projectTotals(),

    // Opening balances: undated, so they are a total and never a data point.
    prisma.wallet.aggregate({ _sum: { investmentAmount: true, profitAmount: true } }),

    // Capital standing today, net of what has been returned.
    prisma.walletInvestment.findMany({
      where:  { status: 'ACTIVE' },
      select: { amount: true, returnedAmount: true },
    }),
    // Capital placed inside the window, for the series.
    prisma.walletInvestment.findMany({
      where:  window ? { investedAt: window } : {},
      select: { amount: true, investedAt: true },
    }),

    prisma.profitRecord.aggregate({ _sum: { amount: true } }),
    prisma.profitRecord.findMany({
      where:  window ? { generatedAt: window } : {},
      select: { amount: true, generatedAt: true },
    }),

    prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.transaction.findMany({
      where:  { status: 'COMPLETED', ...(window ? { createdAt: window } : {}) },
      select: { amount: true, createdAt: true, type: true, category: true },
    }),
    prisma.transaction.groupBy({
      by: ['category'],
      where: { status: 'COMPLETED', ...(window ? { createdAt: window } : {}) },
      _count: { _all: true },
      _sum: { amount: true },
    }),

    prisma.user.groupBy({ by: ['status'], where: { role: 'MEMBER', deletedAt: null }, _count: { _all: true } }),
  ]);

  const openingCapital = money(openingWallets._sum.investmentAmount || 0);
  const openingProfit  = money(openingWallets._sum.profitAmount || 0);
  const ledgerCapital  = money(liveInvestments.reduce((sum, i) => sum + liveCapital(i), 0));
  const ledgerProfit   = money(allProfit._sum.amount || 0);

  // ── The series ──
  // One pass per source into a shared map, so every bucket holds all three
  // measures and a gap in one of them is still a point on the others.
  const buckets = new Map();
  const touch = (key) => {
    if (!buckets.has(key)) {
      buckets.set(key, { bucket: key, investment: 0, profit: 0, transactions: 0, volume: 0 });
    }
    return buckets.get(key);
  };

  for (const inv of rangedInvestments) touch(bucketKey(inv.investedAt, granularity)).investment += inv.amount;
  for (const rec of rangedProfit)      touch(bucketKey(rec.generatedAt, granularity)).profit += rec.amount;
  for (const tx of rangedTx) {
    const b = touch(bucketKey(tx.createdAt, granularity));
    b.transactions += 1;
    b.volume += tx.amount;
  }

  const series = [...buckets.values()]
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
    .slice(-MAX_BUCKETS)
    .map((b) => ({
      bucket: b.bucket,
      investment: money(b.investment),
      profit: money(b.profit),
      transactions: b.transactions,
      volume: money(b.volume),
    }));

  const rangedInvestmentTotal = money(rangedInvestments.reduce((s, i) => s + i.amount, 0));
  const rangedProfitTotal     = money(rangedProfit.reduce((s, r) => s + r.amount, 0));
  const rangedVolume          = money(rangedTx.reduce((s, t) => s + t.amount, 0));

  const memberCounts = Object.fromEntries(members.map((m) => [m.status, m._count._all]));

  return {
    assets,
    projects,

    investment: {
      // As of now: opening balances plus the live project ledger.
      total: money(openingCapital + ledgerCapital),
      opening: openingCapital,
      ledger: ledgerCapital,
      // Placed inside the window. Dated rows only - see the header.
      inRange: rangedInvestmentTotal,
      count: rangedInvestments.length,
    },

    profit: {
      total: money(openingProfit + ledgerProfit),
      opening: openingProfit,
      ledger: ledgerProfit,
      inRange: rangedProfitTotal,
      count: rangedProfit.length,
    },

    transactions: {
      total: txTotals._count._all,
      volume: money(txTotals._sum.amount || 0),
      inRange: rangedTx.length,
      inRangeVolume: rangedVolume,
      byCategory: txByCategory
        .map((c) => ({
          category: c.category || 'UNCATEGORISED',
          count: c._count._all,
          volume: money(c._sum.amount || 0),
        }))
        .sort((a, b) => b.volume - a.volume),
    },

    members: {
      active:  memberCounts.ACTIVE || 0,
      pending: memberCounts.PENDING || 0,
      frozen:  memberCounts.FROZEN || 0,
      rejected: memberCounts.REJECTED || 0,
    },

    series,
  };
}

module.exports = {
  RANGES, GRANULARITIES, MAX_BUCKETS,
  ASSET_PROJECT_STATUS, ASSET_COMPANY_STATUS,
  LIVE_PROJECT_STATUS, LIVE_COMPANY_STATUS,
  resolveRange, bucketKey, assetsByIndustry, projectTotals, overview,
};
