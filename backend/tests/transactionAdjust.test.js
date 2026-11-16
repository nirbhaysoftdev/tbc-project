// tests/transactionAdjust.test.js
//
// Super admin editing and undoing transactions: the source records move with
// the row, the balance follows, an undone profit cannot be re-credited by the
// monthly job, and nothing may leave a member with negative available profit.
// Real services, real database; everything created is deleted again.
require('dotenv').config();
process.env.SMTP_TRANSPORT = 'json';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const engine = require('../src/services/investmentEngine');
const adjust = require('../src/services/transactionAdjust');
const walletService = require('../src/services/walletService');

const suffix = crypto.randomBytes(5).toString('hex');
let member; let admin;
const actor = () => ({ id: admin.id, name: 'Test Super' });
const daysAgo = (n) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const breakdown = () => walletService.getWalletBreakdown(member.id);
const txFor = (where) => prisma.transaction.findFirst({ where: { userId: member.id, ...where }, orderBy: { createdAt: 'desc' } });

test.before(async () => {
  member = await prisma.user.create({ data: { name: 'Test Adjust', email: `${suffix}-m@example.test`, role: 'MEMBER', status: 'ACTIVE', emailVerified: true } });
  admin = await prisma.user.create({ data: { name: 'Test Super', email: `${suffix}-s@example.test`, role: 'SUPER_ADMIN', status: 'ACTIVE', emailVerified: true } });
  await prisma.wallet.create({ data: { userId: member.id } });
});

test.after(async () => {
  for (const id of [member.id, admin.id]) {
    await prisma.activityLog.deleteMany({ where: { OR: [{ targetId: id }, { actorId: id }] } });
    await prisma.adminLog.deleteMany({ where: { OR: [{ adminId: id }, { targetId: id }] } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: id } });
  }
  await prisma.user.delete({ where: { id: member.id } });
  await prisma.user.delete({ where: { id: admin.id } });
  await prisma.$disconnect();
});

test('editing an investment moves the capital, the date and the transaction together', async () => {
  const { investment } = await engine.createInvestment({ userId: member.id, projectId: null, amount: 10000, investedAt: daysAgo(40), createdBy: admin.id });
  const tx = await txFor({ category: 'INVESTMENT' });

  await assert.rejects(adjust.edit({ id: tx.id, amount: 12000, reason: '', actor: actor() }), /reason/i);
  await assert.rejects(adjust.edit({ id: tx.id, reason: 'nothing', actor: actor() }), /nothing/i);

  await adjust.edit({ id: tx.id, amount: 12000, date: ymd(daysAgo(35)), reason: 'typo in amount', actor: actor() });
  assert.equal((await breakdown()).investedCapital, 12000);
  const inv = await prisma.walletInvestment.findUnique({ where: { id: investment?.id || tx.investmentId } });
  assert.equal(inv.amount, 12000);
  assert.equal(ymd(inv.investedAt), ymd(daysAgo(35)));
  assert.equal((await prisma.transaction.findUnique({ where: { id: tx.id } })).amount, 12000);

  const log = await prisma.activityLog.findMany({ where: { targetId: member.id, type: 'TRANSACTION_EDITED' } });
  assert.equal(log.length, 1);
});

test('editing a profit changes the profit; undoing it takes it back and the cycle stays closed', async () => {
  const rec = await engine.createOneTimeProfit({ userId: member.id, projectId: null, profitType: 'ONE_TIME_AMOUNT', value: 500, effectiveDate: ymd(daysAgo(5)), createdBy: admin.id });
  const tx = await txFor({ profitRecordId: rec.id });

  await adjust.edit({ id: tx.id, amount: 700, reason: 'agreed 700', actor: actor() });
  assert.equal((await breakdown()).grossProfit, 700);

  await adjust.undo({ id: tx.id, reason: 'paid in error', actor: actor() });
  const b = await breakdown();
  assert.equal(b.grossProfit, 0);
  assert.equal(b.totalBalance, 12000);

  const after = await prisma.transaction.findUnique({ where: { id: tx.id } });
  assert.equal(after.status, 'REVERSED');
  // The record is kept (at zero) so its cycle key is not free to be re-credited.
  const kept = await prisma.profitRecord.findUnique({ where: { id: rec.id } });
  assert.equal(kept.amount, 0);

  await assert.rejects(adjust.undo({ id: tx.id, reason: 'again', actor: actor() }), /already/i);
  await assert.rejects(adjust.edit({ id: tx.id, amount: 5, reason: 'edit undone', actor: actor() }), /already/i);
});

test('profit that has already been withdrawn cannot be undone', async () => {
  const rec = await engine.createOneTimeProfit({ userId: member.id, projectId: null, profitType: 'ONE_TIME_AMOUNT', value: 300, effectiveDate: ymd(daysAgo(3)), createdBy: admin.id });
  const tx = await txFor({ profitRecordId: rec.id });
  await prisma.wallet.update({ where: { userId: member.id }, data: { withdrawnProfit: 300 } });
  await walletService.syncWallet(member.id);

  await assert.rejects(adjust.undo({ id: tx.id, reason: 'try', actor: actor() }), /negative available profit/i);
  assert.equal((await prisma.profitRecord.findUnique({ where: { id: rec.id } })).amount, 300);   // rolled back
  assert.equal((await prisma.transaction.findUnique({ where: { id: tx.id } })).status, 'COMPLETED');

  await prisma.wallet.update({ where: { userId: member.id }, data: { withdrawnProfit: 0 } });
});

test('a manual credit moves the wallet when edited and undone', async () => {
  await prisma.wallet.update({ where: { userId: member.id }, data: { profitAmount: 200 } });
  const tx = await prisma.transaction.create({ data: { userId: member.id, type: 'CREDIT', category: 'ADMIN_CREDIT', description: 'manual', amount: 200, status: 'COMPLETED' } });
  await walletService.syncWallet(member.id);
  const base = (await breakdown()).grossProfit;

  await adjust.edit({ id: tx.id, amount: 250, reason: 'fix', actor: actor() });
  assert.equal((await breakdown()).grossProfit, base + 50);
  await adjust.undo({ id: tx.id, reason: 'not owed', actor: actor() });
  assert.equal((await breakdown()).grossProfit, base - 200);
});

test('undoing an investment cancels it and drops the capital', async () => {
  const tx = await txFor({ category: 'INVESTMENT' });
  await adjust.undo({ id: tx.id, reason: 'never received', actor: actor() });
  assert.equal((await breakdown()).investedCapital, 0);
  assert.equal((await prisma.walletInvestment.findUnique({ where: { id: tx.investmentId } })).status, 'CANCELLED');
});

test('categories without a single source record are refused', async () => {
  const tx = await prisma.transaction.create({ data: { userId: member.id, type: 'DEBIT', category: 'WITHDRAWAL', description: 'w', amount: 10, status: 'COMPLETED' } });
  await assert.rejects(adjust.edit({ id: tx.id, amount: 5, reason: 'try', actor: actor() }), /cannot be edited or undone/i);
  await assert.rejects(adjust.undo({ id: tx.id, reason: 'try', actor: actor() }), /cannot be edited or undone/i);
});
