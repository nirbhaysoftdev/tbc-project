// tests/receipts.test.js
//
// Investment -> Zoho Books invoice, with the payment recorded against it. Zoho is a stubbed global fetch; the
// engine, worker, mailer (json transport) and database are real.
require('dotenv').config();
process.env.SMTP_TRANSPORT = 'json';
Object.assign(process.env, {
  ZOHO_DC: 'eu', ZOHO_ORG_ID: '1', ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_REFRESH_TOKEN: 'r',
  ZOHO_DEPOSIT_ACCOUNT_ID: 'acc-1', ZOHO_SEND_INVOICES: 'true',
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const prisma = require('../src/utils/prismaClient');
const engine = require('../src/services/investmentEngine');
const receipts = require('../src/services/receipts');
const zoho = require('../src/services/zohoBooks');

const suffix = crypto.randomBytes(5).toString('hex');
const realFetch = global.fetch;
let member; let calls; let failReceipts;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubZoho() {
  calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url); const path = u.pathname.replace('/books/v3', '');
    calls.push(`${opts.method || 'GET'} ${path}`);
    if (u.pathname === '/oauth/v2/token') return json({ access_token: 't', expires_in: 3600 });
    if (path === '/settings/currencies') return json({ code: 0, currencies: [{ currency_id: 'eur-1', currency_code: 'EUR' }] });
    if (path === '/contacts' && opts.method === 'POST') return json({ code: 0, contact: { contact_id: 'cust-1' } });
    if (path === '/contacts') return json({ code: 0, contacts: [] });
    if (path === '/invoices' && opts.method === 'POST') {
      if (failReceipts) return json({ code: 1, message: 'boom' }, 500);
      return json({ code: 0, invoice: { invoice_id: 'inv-1', invoice_number: 'INV-00001', status: 'draft' } });
    }
    if (path === '/invoices') return json({ code: 0, invoices: [] });
    if (path === '/invoices/inv-1/status/sent') return json({ code: 0 });
    if (path === '/customerpayments' && opts.method === 'POST') return json({ code: 0, payment: { payment_id: 'pay-1' } });
    if (path === '/customerpayments') return json({ code: 0, customerpayments: [] });
    if (path === '/invoices/inv-1') return new Response(Buffer.from('%PDF-1.4 fake'), { status: 200 });
    return json({ code: 1, message: `unexpected ${path}` }, 404);
  };
}

// The engine kicks the worker itself, so a tick of ours may find one already
// running. Poll until the row reaches the state under test.
async function until(where, pred) {
  for (let i = 0; i < 60; i++) {
    await receipts.tick();
    const r = await prisma.receipt.findUnique({ where });
    if (pred(r)) return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  return prisma.receipt.findUnique({ where });
}

// The dev database may hold real Zoho settings saved from the portal, which win
// over the environment these tests set. Put them aside for the run and restore
// them exactly afterwards; the tests must never touch real credentials.
let savedConfigRow = null;

test.before(async () => {
  const config = require('../src/services/zohoConfig');
  savedConfigRow = await prisma.systemConfig.findUnique({ where: { key: config.KEY } });
  if (savedConfigRow) await prisma.systemConfig.delete({ where: { key: config.KEY } });
  config.invalidate();
  zoho._resetTokenCache();
  member = await prisma.user.create({ data: { name: 'Receipt Member', email: `${suffix}-m@example.test`, role: 'MEMBER', status: 'ACTIVE', emailVerified: true } });
  await prisma.wallet.create({ data: { userId: member.id } });
  await prisma.profile.create({ data: { userId: member.id, streetAddress: '1 Main St', city: 'Milan', state: 'MI', postalCode: '20100', country: 'Italy' } });
});

test.after(async () => {
  global.fetch = realFetch;
  const config = require('../src/services/zohoConfig');
  await prisma.systemConfig.deleteMany({ where: { key: config.KEY } });
  if (savedConfigRow) await prisma.systemConfig.create({ data: { key: savedConfigRow.key, value: savedConfigRow.value } });
  config.invalidate();
  await prisma.activityLog.deleteMany({ where: { OR: [{ targetId: member.id }, { actorId: member.id }] } });
  await prisma.notification.deleteMany({ where: { userId: member.id } });
  await prisma.user.delete({ where: { id: member.id } });
});

test('an investment queues an invoice that the worker creates, marks paid in Zoho and emails', async () => {
  stubZoho(); failReceipts = false;
  const inv = await engine.createInvestment({ userId: member.id, amount: 1250.5, createdBy: member.id });
  let r = await prisma.receipt.findUnique({ where: { investmentId: inv.id } });
  assert.equal(r.status, 'PENDING');
  assert.equal(r.currency, 'EUR');
  assert.equal(r.amount, 1250.5);

  r = await until({ investmentId: inv.id }, (x) => x.emailedAt);
  assert.equal(r.status, 'ISSUED');
  assert.equal(r.receiptNumber, 'INV-00001');
  assert.ok(r.emailedAt && r.paymentRecordedAt);
  assert.equal(r.zohoPaymentId, 'pay-1');
  assert.ok(calls.includes('POST /contacts') && calls.includes('POST /invoices') && calls.includes('POST /customerpayments'));
  assert.ok(calls.indexOf('POST /customerpayments') > calls.indexOf('POST /invoices'), 'payment follows the invoice');
  assert.equal((await prisma.user.findUnique({ where: { id: member.id } })).zohoCustomerId, 'cust-1');
});

test('a Zoho failure delays the receipt but never the investment, and a retry succeeds', async () => {
  stubZoho(); failReceipts = true;
  const inv = await engine.createInvestment({ userId: member.id, amount: 10, createdBy: member.id });
  let r = await until({ investmentId: inv.id }, (x) => x.lastError);
  assert.equal(r.status, 'PENDING');
  assert.match(r.lastError, /boom/);
  assert.equal((await prisma.walletInvestment.findUnique({ where: { id: inv.id } })).status, 'ACTIVE');

  failReceipts = false;
  await prisma.receipt.update({ where: { id: r.id }, data: { runAfter: new Date() } });
  r = await until({ id: r.id }, (x) => x.status === 'ISSUED');
  assert.equal(r.status, 'ISSUED');
});

test('with Zoho unconfigured no receipt is queued', async () => {
  const saved = process.env.ZOHO_ORG_ID; delete process.env.ZOHO_ORG_ID;
  try {
    const inv = await engine.createInvestment({ userId: member.id, amount: 5, createdBy: member.id });
    assert.equal(await prisma.receipt.findUnique({ where: { investmentId: inv.id } }), null);
  } finally { process.env.ZOHO_ORG_ID = saved; }
});

test('an investment keeps its note, trimmed, and it goes on the Zoho invoice', async () => {
  stubZoho(); failReceipts = false;
  let body;
  const base = global.fetch;
  global.fetch = async (url, opts = {}) => {
    if (new URL(url).pathname.endsWith('/invoices') && opts.method === 'POST') body = JSON.parse(opts.body);
    return base(url, opts);
  };
  const inv = await engine.createInvestment({ userId: member.id, amount: 7, createdBy: member.id, note: '  Paid by cheque 114  ' });
  assert.equal((await prisma.walletInvestment.findUnique({ where: { id: inv.id } })).note, 'Paid by cheque 114');
  await until({ investmentId: inv.id }, (x) => x.emailedAt);
  assert.equal(body.notes, 'Paid by cheque 114');
  await assert.rejects(
    engine.createInvestment({ userId: member.id, amount: 7, createdBy: member.id, note: 'x'.repeat(501) }),
    /500 characters/,
  );
});

test('an investment is filed under its project\'s category, or the one chosen when there is no project', async () => {
  const none = await engine.createInvestment({ userId: member.id, amount: 3, createdBy: member.id, category: 'oil_gas' });
  assert.equal((await prisma.walletInvestment.findUnique({ where: { id: none.id } })).category, 'OIL_GAS');
  await assert.rejects(engine.createInvestment({ userId: member.id, amount: 3, createdBy: member.id, category: 'GOLD' }), /Unknown category/);

  const owner = await prisma.user.create({ data: { name: 'Cat Owner', email: `${suffix}-o@example.test`, role: 'MEMBER', status: 'ACTIVE', emailVerified: true } });
  const project = await prisma.project.create({ data: { ownerId: owner.id, title: `Cat ${suffix}`, description: 'd', category: 'TECHNOLOGY', targetAmount: 1000, fundingDeadline: new Date(Date.now() + 864e5), status: 'ACTIVE' } });
  try {
    const inv = await engine.createInvestment({ userId: member.id, projectId: project.id, amount: 3, createdBy: member.id, category: 'OIL_GAS' });
    assert.equal((await prisma.walletInvestment.findUnique({ where: { id: inv.id } })).category, 'TECHNOLOGY');
    await prisma.transaction.deleteMany({ where: { investmentId: inv.id } });
    await prisma.receipt.deleteMany({ where: { investmentId: inv.id } });
    await prisma.walletInvestment.delete({ where: { id: inv.id } });
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
});

test('portal-stored Zoho settings: secrets are encrypted at rest, win over env, and a blank save keeps them', async () => {
  const config = require('../src/services/zohoConfig');
  const original = await prisma.systemConfig.findUnique({ where: { key: config.KEY } });
  try {
    await config.save({ dc: 'in', orgId: '999999', clientId: 'portal-id', clientSecret: 'portal-secret', refreshToken: 'portal-refresh' });
    const raw = (await prisma.systemConfig.findUnique({ where: { key: config.KEY } })).value;
    assert.ok(!raw.includes('portal-secret') && !raw.includes('portal-refresh'), 'secrets must not be stored in the clear');

    let c = await config.resolve();
    assert.equal(c.clientSecret, 'portal-secret');
    assert.equal(c.dc, 'in');                      // portal beats the env's 'eu'
    assert.equal(c.sources.clientSecret, 'portal');

    await config.save({ clientSecret: '', refreshToken: undefined, paymentMode: 'Cash' });
    c = await config.resolve();
    assert.equal(c.clientSecret, 'portal-secret'); // a blank field leaves the secret alone
    assert.equal(c.paymentMode, 'Cash');

    await config.save({ disconnect: true });
    c = await config.resolve();
    assert.equal(c.clientSecret, process.env.ZOHO_CLIENT_SECRET); // back to the environment
    assert.equal(c.sources.clientSecret, 'env');

    await config.save({ enabled: false });
    assert.equal(await zoho.enabled(), false);     // switched off in the portal
  } finally {
    if (original) await prisma.systemConfig.update({ where: { key: config.KEY }, data: { value: original.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: config.KEY } });
    config.invalidate();
  }
});

test('activating a member links them to Zoho once, and matching is by email', async () => {
  const customers = require('../src/services/zohoCustomers');
  stubZoho();
  await prisma.user.update({ where: { id: member.id }, data: { zohoCustomerId: null } });
  assert.equal(await customers.syncMember(member.id), 'cust-1');
  const before = calls.length;
  assert.equal(await customers.syncMember(member.id), 'cust-1');
  assert.equal(calls.length, before, 'an already-linked member costs no Zoho call');
});

test('in draft mode activating a member does not touch Zoho', async () => {
  const config = require('../src/services/zohoConfig');
  const customers = require('../src/services/zohoCustomers');
  const original = await prisma.systemConfig.findUnique({ where: { key: config.KEY } });
  try {
    stubZoho();
    await prisma.user.update({ where: { id: member.id }, data: { zohoCustomerId: null } });
    await config.save({ sendInvoices: false });
    assert.equal(await customers.syncMember(member.id), null);
    assert.equal(calls.length, 0, 'no Zoho call at all');
    assert.equal((await prisma.user.findUnique({ where: { id: member.id } })).zohoCustomerId, null);
  } finally {
    if (original) await prisma.systemConfig.update({ where: { key: config.KEY }, data: { value: original.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: config.KEY } });
    config.invalidate();
  }
});

test('a one-time Self Client code is exchanged for a refresh token; a bad code says why', async () => {
  const saved = global.fetch;
  try {
    global.fetch = async (url) => {
      const u = new URL(url);
      return u.searchParams.get('code') === 'good'
        ? json({ access_token: 'a', refresh_token: 'refresh-xyz' })
        : json({ error: 'invalid_code' }, 400);
    };
    assert.equal(await zoho.exchangeCode('good'), 'refresh-xyz');
    await assert.rejects(zoho.exchangeCode('stale'), /already used, has expired/);
  } finally { global.fetch = saved; }
});

test('Zoho is off until a deposit account is set', async () => {
  const saved = process.env.ZOHO_DEPOSIT_ACCOUNT_ID; delete process.env.ZOHO_DEPOSIT_ACCOUNT_ID;
  try { assert.equal(await zoho.enabled(), false); } finally { process.env.ZOHO_DEPOSIT_ACCOUNT_ID = saved; }
});

test('draft mode creates the invoice as a draft and sends nothing; releasing the drafts then completes it', async () => {
  const config = require('../src/services/zohoConfig');
  const original = await prisma.systemConfig.findUnique({ where: { key: config.KEY } });
  try {
    stubZoho(); failReceipts = false;
    await config.save({ sendInvoices: false });
    const inv = await engine.createInvestment({ userId: member.id, amount: 11, createdBy: member.id });
    let r = await until({ investmentId: inv.id }, (x) => x.status === 'DRAFT');
    assert.equal(r.status, 'DRAFT');
    assert.equal(r.receiptNumber, 'INV-00001');
    assert.ok(calls.includes('POST /invoices'));
    assert.ok(!calls.some((c) => c.includes('/status/sent') || c === 'POST /customerpayments'), 'a draft is not sent or paid');
    assert.equal(r.emailedAt, null);
    assert.equal(r.paymentRecordedAt, null);

    // Still not live: releasing is refused.
    await assert.rejects(receipts.sendDrafts(), /live mode/);

    await config.save({ sendInvoices: true });
    assert.ok((await receipts.sendDrafts()) >= 1);
    r = await until({ investmentId: inv.id }, (x) => x.status === 'ISSUED' && x.emailedAt);
    assert.equal(r.status, 'ISSUED');
    assert.ok(r.paymentRecordedAt && r.emailedAt);
    assert.equal(calls.filter((c) => c === 'POST /invoices').length, 1, 'the draft is reused, not created again');
  } finally {
    if (original) await prisma.systemConfig.update({ where: { key: config.KEY }, data: { value: original.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: config.KEY } });
    config.invalidate();
  }
});

test('draft mode does not need a deposit account', async () => {
  const config = require('../src/services/zohoConfig');
  const saved = process.env.ZOHO_DEPOSIT_ACCOUNT_ID; delete process.env.ZOHO_DEPOSIT_ACCOUNT_ID;
  const original = await prisma.systemConfig.findUnique({ where: { key: config.KEY } });
  try {
    await config.save({ sendInvoices: false });
    assert.equal(await zoho.enabled(), true);
    await config.save({ sendInvoices: true });
    assert.equal(await zoho.enabled(), false);
  } finally {
    process.env.ZOHO_DEPOSIT_ACCOUNT_ID = saved;
    if (original) await prisma.systemConfig.update({ where: { key: config.KEY }, data: { value: original.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: config.KEY } });
    config.invalidate();
  }
});
