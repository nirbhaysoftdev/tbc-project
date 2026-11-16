// tests/monthlyOpeningBalance.test.js
//
// An opening balance is capital with no project, so a monthly fix in the
// general scope must be calculated on it - and a project's fix must not.
require('dotenv').config();
process.env.SMTP_TRANSPORT = 'json';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const engine = require('../src/services/investmentEngine');

const suffix = crypto.randomBytes(5).toString('hex');
let member;

test.before(async () => {
  member = await prisma.user.create({
    data: { name: 'Test Opening', email: `${suffix}-open@example.test`, role: 'MEMBER', status: 'ACTIVE', emailVerified: true },
  });
  await prisma.wallet.create({ data: { userId: member.id, investmentAmount: 10000 } });
});

test.after(async () => {
  await prisma.activityLog.deleteMany({ where: { description: { contains: member.email } } });
  await prisma.notification.deleteMany({ where: { userId: member.id } });
  await prisma.user.delete({ where: { id: member.id } });
  await prisma.$disconnect();
});

test('opening balance is capital in the general scope, eligible immediately', async () => {
  assert.equal(await engine.getTotalCapital(member.id, null), 10000);
  assert.equal(await engine.getEligibleCapitalForDate(member.id, null, new Date(), 15), 10000);
});

test('a monthly % fix on an opening balance previews and credits', async () => {
  await engine.setMonthlyProfitConfig({ userId: member.id, projectId: null, rate: 2, monthlyProfitDay: 1,
    effectiveFrom: new Date(2020, 0, 1), createdBy: null });
  const preview = await engine.previewMonthlyProfit(member.id, null);
  assert.equal(preview.eligibleCapital, 10000);
  assert.equal(preview.monthlyAmount, 200);

  const cycle = new Date(2026, 0, 1);
  const { record, generated } = await engine.computeMonthlyProfitForPeriod({
    userId: member.id, projectId: null, periodDate: cycle, createdBy: null,
  });
  assert.equal(generated, true);
  assert.equal(record.amount, 200);
});

test('the opening balance does not leak into a project scope', async () => {
  const project = await prisma.project.findFirst({ select: { id: true } });
  if (!project) return;
  assert.equal(await engine.getTotalCapital(member.id, project.id), 0);
});
