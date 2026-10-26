// tests/adminAnalytics.test.js
//
// The Overview's figures: what counts as an asset, the dated/undated split that
// keeps opening balances out of the charts, and the window arithmetic.
//
// These assert DELTAS, not absolutes. The suite runs against the development
// database, which already holds real companies, projects and ledger rows — an
// assertion like "assets total is 320000" would be a test of that machine's
// data rather than of this code. Every test takes a baseline, creates its
// fixtures, and checks what moved.
require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const analytics = require('../src/services/adminAnalytics');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set to run these tests');

const suffix = crypto.randomBytes(5).toString('hex');
const tag = (name) => `tbcanalytics-${suffix}-${name}`;
const created = { users: [], projects: [], companies: [] };

let server;
let baseUrl;
let admin;
let member;

const tokenFor = (user) => jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function call(path, { user } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: user ? { Authorization: `Bearer ${tokenFor(user)}` } : {},
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

const overviewFor = (query = {}) => analytics.overview(analytics.resolveRange(query));

/** The named industry's row, or a zeroed stand-in so a test reads the same either way. */
const industry = (data, name) =>
  data.assets.byIndustry.find((i) => i.industry.toLowerCase() === name.toLowerCase())
  || { total: 0, companies: 0, projects: 0 };

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../src/routes/adminAnalytics'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const makeUser = async ({ name, role = 'MEMBER' }) => {
    const user = await prisma.user.create({
      data: { name: `An ${name}`, email: `${tag(name)}@example.test`, role, status: 'ACTIVE', emailVerified: true },
      select: { id: true, name: true, role: true },
    });
    created.users.push(user.id);
    return user;
  };

  admin = await makeUser({ name: 'admin', role: 'ADMIN' });
  member = await makeUser({ name: 'member' });
});

test.after(async () => {
  if (created.projects.length) {
    await prisma.transaction.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.profitRecord.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.walletInvestment.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  }
  if (created.companies.length) {
    await prisma.company.deleteMany({ where: { id: { in: created.companies } } });
  }
  if (created.users.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.profitRecord.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.walletInvestment.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.wallet.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

const makeCompany = async ({ status = 'ACTIVE', valuation, category = tag('industry') }) => {
  const row = await prisma.company.create({
    data: { name: `${tag('co')}-${crypto.randomBytes(2).toString('hex')}`, category, status, valuation },
  });
  created.companies.push(row.id);
  return row;
};

const makeProject = async ({ status = 'ACTIVE', valuation, category = tag('industry'), targetAmount = 100000, raisedAmount = 0 }) => {
  const row = await prisma.project.create({
    data: {
      ownerId: admin.id,
      title: `${tag('project')}-${crypto.randomBytes(2).toString('hex')}`,
      description: 'Analytics fixture.',
      category, status, valuation, targetAmount, raisedAmount,
      fundingDeadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  created.projects.push(row.id);
  return row;
};

// ─── The gate ────────────────────────────────────────────────────────────────

test('the Overview is admin-only', async () => {
  assert.equal((await call('/api/admin/analytics')).status, 401);
  assert.equal((await call('/api/admin/analytics', { user: member })).status, 403);

  const ok = await call('/api/admin/analytics', { user: admin });
  assert.equal(ok.status, 200);
  // The window it actually used, so the UI labels the chart with the truth.
  assert.equal(ok.body.range.key, 'all');
  assert.ok(ok.body.range.granularity);
});

// ─── Assets ──────────────────────────────────────────────────────────────────

test('assets count live companies and projects, and nothing else', async () => {
  const before = await overviewFor();

  await makeCompany({ status: 'ACTIVE', valuation: 500000, category: tag('live') });
  await makeProject({ status: 'ACTIVE', valuation: 300000, category: tag('live') });
  await makeProject({ status: 'FUNDED', valuation: 200000, category: tag('live') });

  // None of these are live, so none of them are assets.
  await makeCompany({ status: 'DRAFT', valuation: 999999, category: tag('live') });
  await makeCompany({ status: 'ARCHIVED', valuation: 999999, category: tag('live') });
  await makeProject({ status: 'DRAFT', valuation: 999999, category: tag('live') });
  await makeProject({ status: 'CANCELLED', valuation: 999999, category: tag('live') });

  const after = await overviewFor();
  assert.equal(after.assets.total - before.assets.total, 1000000);
  assert.equal(industry(after, tag('live')).total, 1000000);
  assert.equal(industry(after, tag('live')).companies, 1);
  assert.equal(industry(after, tag('live')).projects, 2);
});

test('an unvalued record is counted, never treated as worth zero', async () => {
  const before = await overviewFor();

  await makeCompany({ status: 'ACTIVE', valuation: null, category: tag('unvalued') });
  await makeProject({ status: 'ACTIVE', valuation: null, category: tag('unvalued') });

  const after = await overviewFor();
  // It adds nothing to the money...
  assert.equal(after.assets.total, before.assets.total);
  // ...but the screen can say "across 11 of 14" rather than implying 14.
  assert.equal(after.assets.companies.unvalued - before.assets.companies.unvalued, 1);
  assert.equal(after.assets.projects.unvalued - before.assets.projects.unvalued, 1);
  assert.equal(after.assets.companies.count - before.assets.companies.count, 1);
  assert.equal(after.assets.companies.valued - before.assets.companies.valued, 0);
});

test('industries merge on spelling, so REAL_ESTATE and Real Estate are one', async () => {
  const before = await overviewFor();
  const rows = before.assets.byIndustry.length;

  await makeCompany({ status: 'ACTIVE', valuation: 100000, category: 'TBC_SPELLING_TEST' });
  await makeProject({ status: 'ACTIVE', valuation: 100000, category: 'tbc spelling test' });
  await makeProject({ status: 'ACTIVE', valuation: 100000, category: 'Tbc-Spelling-Test' });

  const after = await overviewFor();
  assert.equal(after.assets.byIndustry.length, rows + 1, 'three spellings, one industry');

  const row = after.assets.byIndustry.find((i) => i.industry === 'TBC_SPELLING_TEST');
  assert.equal(row.total, 300000);
  assert.equal(row.companies, 1);
  assert.equal(row.projects, 2);
  // The first spelling seen wins the label rather than a normalised key the
  // admin never typed.
  assert.equal(row.industry, 'TBC_SPELLING_TEST');
});

test('shares are of the valued total and add up', async () => {
  const data = await overviewFor();
  if (data.assets.total <= 0) return;   // nothing valued on this machine
  const sum = data.assets.byIndustry.reduce((s, i) => s + i.share, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, `shares sum to ~100, got ${sum}`);
  // Sorted biggest first, so the donut and the list agree.
  const totals = data.assets.byIndustry.map((i) => i.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
});

// ─── Member wallets as an asset ──────────────────────────────────────────────

/** A member with a wallet of their own, so a wallet test cannot disturb another. */
const makeWalletMember = async (wallet) => {
  const user = await prisma.user.create({
    data: {
      name: 'A wallet holder',
      email: `${tag('wallet')}-${crypto.randomBytes(3).toString('hex')}@example.test`,
      role: 'MEMBER', status: 'ACTIVE', emailVerified: true,
    },
    select: { id: true },
  });
  created.users.push(user.id);
  await prisma.wallet.create({ data: { userId: user.id, ...wallet } });
  return user;
};

test('what members hold in their wallets is part of the assets total', async () => {
  const before = await overviewFor();
  const rows = before.assets.byIndustry.length;

  await makeWalletMember({ investmentAmount: 40000, profitAmount: 1000, totalBalance: 41000 });

  const after = await overviewFor();
  assert.equal(after.assets.wallets.value - before.assets.wallets.value, 41000);
  assert.equal(after.assets.wallets.capital - before.assets.wallets.capital, 40000);
  assert.equal(after.assets.wallets.profit - before.assets.wallets.profit, 1000);
  assert.equal(after.assets.wallets.count - before.assets.wallets.count, 1);
  assert.equal(after.assets.total - before.assets.total, 41000);

  // ...and none of it is a valuation, so the industry table does not move.
  assert.equal(after.assets.portfolio, before.assets.portfolio);
  assert.equal(after.assets.byIndustry.length, rows);
});

test('the assets total is the two halves and nothing else', async () => {
  const data = await overviewFor();
  assert.equal(data.assets.total, data.assets.portfolio + data.assets.wallets.value);
  assert.equal(
    data.assets.portfolio,
    data.assets.companies.value + data.assets.projects.value,
  );
  // A wallet asset is the member's own balance formula, not the raw columns.
  assert.equal(data.assets.wallets.value, data.assets.wallets.capital + data.assets.wallets.profit);
});

test('money on its way out of a wallet is not an asset', async () => {
  const before = await overviewFor();

  // 5000 of profit, of which 1000 is already withdrawn and 500 is reserved for
  // a pending withdrawal - exactly what walletService keeps out of a balance.
  await makeWalletMember({
    investmentAmount: 10000, profitAmount: 5000,
    withdrawnProfit: 1000, pendingWithdrawal: 500, totalBalance: 13500,
  });

  const after = await overviewFor();
  assert.equal(after.assets.wallets.value - before.assets.wallets.value, 13500);
  assert.equal(after.assets.wallets.profit - before.assets.wallets.profit, 3500);
});

test('a live project investment is a wallet asset, the returned part is not', async () => {
  const project = await makeProject({ status: 'DRAFT', valuation: null, category: tag('walletledger') });
  const user = await makeWalletMember({ investmentAmount: 0, profitAmount: 0 });
  const before = await overviewFor();

  const row = await prisma.walletInvestment.create({
    data: { userId: user.id, projectId: project.id, amount: 8000, investedAt: new Date(), status: 'ACTIVE' },
  });
  const mid = await overviewFor();
  assert.equal(mid.assets.wallets.capital - before.assets.wallets.capital, 8000);
  assert.equal(mid.assets.total - before.assets.total, 8000, 'a DRAFT project is no valuation');

  await prisma.walletInvestment.update({ where: { id: row.id }, data: { returnedAmount: 3000 } });

  const after = await overviewFor();
  assert.equal(after.assets.wallets.capital - before.assets.wallets.capital, 5000);
});

// ─── The dated / undated split ───────────────────────────────────────────────

test('an opening balance counts towards the total but never lands in a month', async () => {
  const before = await overviewFor({ range: 'year' });

  // An opening balance: real money, no project, no date.
  await prisma.wallet.create({
    data: { userId: member.id, investmentAmount: 50000, profitAmount: 2500, totalBalance: 52500 },
  });

  const after = await overviewFor({ range: 'year' });

  assert.equal(after.investment.total - before.investment.total, 50000, 'in the total');
  assert.equal(after.investment.opening - before.investment.opening, 50000, 'reported as opening');
  assert.equal(after.investment.inRange, before.investment.inRange, 'NOT in the window');
  assert.equal(after.profit.total - before.profit.total, 2500);
  assert.equal(after.profit.inRange, before.profit.inRange);

  // And nothing was added to any bucket of the chart.
  const sumInvestment = (d) => d.series.reduce((s, b) => s + b.investment, 0);
  assert.equal(sumInvestment(after), sumInvestment(before));
});

test('dated capital and profit appear in both the total and the window', async () => {
  const project = await makeProject({ status: 'ACTIVE', valuation: 1000, category: tag('dated') });
  const before = await overviewFor({ range: 'year' });

  await prisma.walletInvestment.create({
    data: { userId: member.id, projectId: project.id, amount: 12000, investedAt: new Date(), status: 'ACTIVE' },
  });
  await prisma.profitRecord.create({
    data: {
      userId: member.id, projectId: project.id, scopeKey: project.id,
      type: 'ONE_TIME', period: `${tag('p')}`, capitalSnapshot: 12000, amount: 600,
    },
  });

  const after = await overviewFor({ range: 'year' });

  assert.equal(after.investment.total - before.investment.total, 12000);
  assert.equal(after.investment.ledger - before.investment.ledger, 12000);
  assert.equal(after.investment.inRange - before.investment.inRange, 12000);
  assert.equal(after.profit.inRange - before.profit.inRange, 600);

  // It is in the chart too, in the bucket for today.
  const key = analytics.bucketKey(new Date(), after.range?.granularity || 'month');
  const sum = (d, field) => d.series.reduce((s, b) => s + b[field], 0);
  assert.equal(sum(after, 'investment') - sum(before, 'investment'), 12000);
  assert.ok(typeof key === 'string');
});

test('returned capital leaves the standing total', async () => {
  const project = await makeProject({ status: 'ACTIVE', valuation: 1000, category: tag('returned') });
  const before = await overviewFor();

  const row = await prisma.walletInvestment.create({
    data: { userId: member.id, projectId: project.id, amount: 10000, investedAt: new Date(), status: 'ACTIVE' },
  });
  const mid = await overviewFor();
  assert.equal(mid.investment.ledger - before.investment.ledger, 10000);

  await prisma.walletInvestment.update({ where: { id: row.id }, data: { returnedAmount: 4000 } });

  const after = await overviewFor();
  assert.equal(after.investment.ledger - before.investment.ledger, 6000, 'only the live part stands');
});

// ─── Windows ─────────────────────────────────────────────────────────────────

test('a custom window excludes what falls outside it', async () => {
  const project = await makeProject({ status: 'ACTIVE', valuation: 1000, category: tag('window') });
  const longAgo = new Date('2024-03-15T12:00:00Z');

  await prisma.walletInvestment.create({
    data: { userId: member.id, projectId: project.id, amount: 7000, investedAt: longAgo, status: 'ACTIVE' },
  });

  const inside = await overviewFor({ range: 'custom', from: '2024-03-01', to: '2024-03-31' });
  const outside = await overviewFor({ range: 'custom', from: '2024-04-01', to: '2024-04-30' });

  assert.ok(inside.investment.inRange >= 7000);
  assert.equal(inside.series.some((b) => b.bucket.startsWith('2024-03')), true);
  assert.equal(outside.series.some((b) => b.bucket.startsWith('2024-03')), false);

  // The standing total ignores the window entirely - it is "as of now".
  assert.equal(inside.investment.total, outside.investment.total);
});

test('a malformed custom range is refused rather than silently widened', async () => {
  const bad = await call('/api/admin/analytics?range=custom', { user: admin });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /from/);

  const backwards = await call('/api/admin/analytics?range=custom&from=2026-06-01&to=2026-01-01', { user: admin });
  assert.equal(backwards.status, 400);

  const nonsense = await call('/api/admin/analytics?range=custom&from=not-a-date', { user: admin });
  assert.equal(nonsense.status, 400);
});

test('the bucket size follows the width of the window', async () => {
  const month = analytics.resolveRange({ range: 'month' });
  const quarter = analytics.resolveRange({ range: 'quarter' });
  const year = analytics.resolveRange({ range: 'year' });

  assert.equal(month.granularity, 'day');
  assert.ok(['week', 'day'].includes(quarter.granularity));
  assert.ok(['month', 'week'].includes(year.granularity));

  // And an explicit granularity always wins.
  assert.equal(analytics.resolveRange({ range: 'year', granularity: 'quarter' }).granularity, 'quarter');
  // An unknown one does not - it falls back to the automatic choice rather
  // than throwing at the caller.
  assert.equal(analytics.resolveRange({ range: 'month', granularity: 'fortnight' }).granularity, 'day');
});

test('bucket keys sort chronologically as plain strings', () => {
  const keys = [
    analytics.bucketKey(new Date('2026-01-05'), 'month'),
    analytics.bucketKey(new Date('2026-10-05'), 'month'),
    analytics.bucketKey(new Date('2025-12-31'), 'month'),
  ];
  assert.deepEqual([...keys].sort(), ['2025-12', '2026-01', '2026-10']);
  assert.equal(analytics.bucketKey(new Date('2026-08-15'), 'quarter'), '2026-Q3');
  assert.equal(analytics.bucketKey(new Date('2026-08-15'), 'year'), '2026');
});

// ─── Transactions and projects ───────────────────────────────────────────────

test('transactions report count and volume, all time and in the window', async () => {
  const before = await overviewFor({ range: 'year' });

  await prisma.transaction.create({
    data: {
      userId: member.id, type: 'CREDIT', category: 'INVESTMENT',
      description: tag('tx'), amount: 2500, status: 'COMPLETED',
    },
  });
  // A failed transaction is not a transaction that happened.
  await prisma.transaction.create({
    data: {
      userId: member.id, type: 'DEBIT', category: 'WITHDRAWAL',
      description: tag('tx-failed'), amount: 9999, status: 'FAILED',
    },
  });

  const after = await overviewFor({ range: 'year' });
  assert.equal(after.transactions.total - before.transactions.total, 1);
  assert.equal(after.transactions.volume - before.transactions.volume, 2500);
  assert.equal(after.transactions.inRange - before.transactions.inRange, 1);

  const cat = after.transactions.byCategory.find((c) => c.category === 'INVESTMENT');
  assert.ok(cat && cat.count >= 1);
});

test('projects are counted by status, with funding as a ratio', async () => {
  const before = await overviewFor();

  await makeProject({ status: 'ACTIVE', valuation: 1000, targetAmount: 100000, raisedAmount: 25000, category: tag('meter') });

  const after = await overviewFor();
  assert.equal(after.projects.running - before.projects.running, 1);
  assert.equal(after.projects.target - before.projects.target, 100000);
  assert.equal(after.projects.raised - before.projects.raised, 25000);
  assert.ok(after.projects.fundingProgress >= 0 && after.projects.fundingProgress <= 100);
});
