// tests/insurance.test.js
//
// The annual insurance return: set-up rules, the credit on the renewal date,
// that a renewal can only ever be paid once, and that a disabled policy pays
// nothing. Real service, real database; everything created is deleted again.
require('dotenv').config();
process.env.SMTP_TRANSPORT = 'json';   // render mail, never send it

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const insurance = require('../src/services/insurance');
const walletService = require('../src/services/walletService');

const suffix = crypto.randomBytes(5).toString('hex');
let member;
const actor = { id: null, name: 'Test Admin' };

const ymd = (d) => insurance.dayKey(d);
const daysFromNow = (n) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };

test.before(async () => {
  member = await prisma.user.create({
    data: { name: 'Test Insured', email: `${suffix}-ins@example.test`, role: 'MEMBER', status: 'ACTIVE', emailVerified: true },
  });
  // Opening capital is capital with no project - enough to insure.
  await prisma.wallet.create({ data: { userId: member.id, investmentAmount: 10000 } });
});

test.after(async () => {
  await prisma.activityLog.deleteMany({ where: { targetId: member.id } });
  await prisma.activityLog.deleteMany({ where: { description: { contains: member.email } } });
  await prisma.notification.deleteMany({ where: { userId: member.id } });
  await prisma.user.delete({ where: { id: member.id } });   // cascades policy, wallet, profit, transactions
  await prisma.$disconnect();
});

test('adding validates the percentage and refuses a future date', async () => {
  await assert.rejects(insurance.addCredit({ userId: member.id, ratePercent: 0, date: ymd(daysFromNow(-1)), actor }), /percentage/i);
  await assert.rejects(insurance.addCredit({ userId: member.id, ratePercent: 101, date: ymd(daysFromNow(-1)), actor }), /percentage/i);
  await assert.rejects(insurance.addCredit({ userId: member.id, ratePercent: 5, date: ymd(daysFromNow(3)), actor }), /future/i);
  await assert.rejects(insurance.addCredit({ userId: member.id, ratePercent: 5, date: 'nope', actor }), /date/i);
  assert.equal(await prisma.profitRecord.count({ where: { userId: member.id, type: 'INSURANCE' } }), 0);
});

test('a date and a % credit the member now and set the renewal a year on', async () => {
  const when = daysFromNow(-10);
  const p = await insurance.addCredit({ userId: member.id, ratePercent: 5, date: ymd(when), actor });
  assert.equal(p.ratePercent, 5);
  assert.equal(ymd(p.renewalDate), ymd(insurance.plusOneYear(when)));
  assert.equal(p.lastCreditedAmount, 500);

  const records = await prisma.profitRecord.findMany({ where: { userId: member.id, type: 'INSURANCE' } });
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 500);
  assert.equal(ymd(records[0].generatedAt), ymd(when));

  const b = await walletService.getWalletBreakdown(member.id);
  assert.equal(b.grossProfit, 500);
  assert.equal(b.totalBalance, 10500);

  const types = (await prisma.activityLog.findMany({ where: { targetId: member.id } })).map((l) => l.type);
  assert.ok(types.includes('INSURANCE_SET'));
  assert.ok(types.includes('INSURANCE_CREDITED'));
});

test('the same date cannot be credited twice, but one more insurance on another date can', async () => {
  const first = daysFromNow(-10);
  await assert.rejects(insurance.addCredit({ userId: member.id, ratePercent: 5, date: ymd(first), actor }), /already exists/i);

  const second = daysFromNow(-2);
  const p = await insurance.addCredit({ userId: member.id, ratePercent: 6, date: ymd(second), actor });
  assert.equal(p.ratePercent, 6);
  assert.equal(ymd(p.renewalDate), ymd(insurance.plusOneYear(second)));
  assert.equal(await prisma.profitRecord.count({ where: { userId: member.id, type: 'INSURANCE' } }), 2);
});

test('an old date rolls the renewal to the next anniversary still ahead', () => {
  const old = new Date(new Date().getFullYear() - 3, 0, 15);
  assert.ok(insurance.nextAnniversary(old) > new Date());
  assert.ok(insurance.nextAnniversary(old) <= insurance.plusOneYear(new Date()));
});

test('nothing is credited before the renewal date', async () => {
  await insurance.creditDue();
  assert.equal(await prisma.profitRecord.count({ where: { userId: member.id, type: 'INSURANCE' } }), 2);
});

test('on the renewal date the policy credits itself once, and moves a year on', async () => {
  const due = daysFromNow(-1);
  await prisma.insurancePolicy.update({ where: { userId: member.id }, data: { renewalDate: due } });

  await insurance.creditDue();
  await insurance.creditDue();   // a second pass must not pay it again

  const records = await prisma.profitRecord.findMany({ where: { userId: member.id, type: 'INSURANCE', period: `INSURANCE-${ymd(due)}` } });
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 600);   // 6% of 10,000 - the % of the latest insurance
  assert.equal(records[0].createdBy, 'system');

  const policy = await prisma.insurancePolicy.findUnique({ where: { userId: member.id } });
  assert.equal(ymd(policy.renewalDate), ymd(insurance.plusOneYear(due)));
});

test('a disabled policy pays nothing, and re-enabling a past date needs a new one', async () => {
  const due = daysFromNow(-1);
  await insurance.update({ userId: member.id, status: 'DISABLED', actor });
  await prisma.insurancePolicy.update({ where: { userId: member.id }, data: { renewalDate: due } });
  await insurance.creditDue();
  assert.equal(await prisma.profitRecord.count({ where: { userId: member.id, type: 'INSURANCE' } }), 3);

  await assert.rejects(insurance.update({ userId: member.id, status: 'ACTIVE', actor }), /new renewal date/i);
  const p = await insurance.update({ userId: member.id, status: 'ACTIVE', renewalDate: ymd(daysFromNow(60)), ratePercent: 7, actor });
  assert.equal(p.status, 'ACTIVE');
  assert.equal(p.ratePercent, 7);

  const types = (await prisma.activityLog.findMany({ where: { targetId: member.id } })).map((l) => l.type);
  for (const t of ['INSURANCE_SET', 'INSURANCE_DISABLED', 'INSURANCE_ENABLED']) assert.ok(types.includes(t), t);
});

test('plusOneYear keeps 29 February inside February', () => {
  assert.equal(ymd(insurance.plusOneYear(new Date(2028, 1, 29))), '2029-02-28');
  assert.equal(ymd(insurance.plusOneYear(new Date(2026, 10, 16))), '2027-11-16');
});
