// src/services/receipts.js
//
// One Zoho Books invoice per investment, with the payment recorded against it
// so it shows as paid. (The names still say "receipt": see the Receipt model.)
//
// The queue is the `receipts` table, the same shape as the announcement and
// translation workers: the row is written in the investment's own transaction
// (so "invested but no receipt queued" cannot happen), and an interval in the
// API process issues it in Zoho. A Zoho outage therefore delays a receipt; it
// never blocks or rolls back an investment.
//
//   * claiming   - a conditional UPDATE that pushes `runAfter` forward, so two
//                  pm2 processes cannot issue the same receipt, and a process
//                  killed mid-call is picked up again once that time passes.
//   * no dupes   - the Zoho invoice's and payment's reference_number is OUR
//                  receipt id, and it is looked up before creating. A crash
//                  between "created in Zoho" and "saved here" is repaired on
//                  the next attempt.
//   * the email  - sent after issuing, with Zoho's PDF attached, and retried on
//                  its own if the mail server is down.
//   * giving up  - after RECEIPT_MAX_ATTEMPTS the row is DEAD; a super admin
//                  can retry it from the transaction list.
const prisma = require('../utils/prismaClient');
const zoho = require('./zohoBooks');
const config = require('./zohoConfig');
const mailer = require('./mailer');
const { categoryLabel } = require('./projectCategories');

const CONFIG = {
  intervalMs: Number(process.env.RECEIPT_WORKER_INTERVAL_MS || 15000),
  batchSize: Number(process.env.RECEIPT_WORKER_BATCH || 5),
  claimMs: Number(process.env.RECEIPT_CLAIM_MS || 2 * 60 * 1000),
  backoffBaseMs: Number(process.env.RECEIPT_BACKOFF_BASE_MS || 60000),
  maxAttempts: Number(process.env.RECEIPT_MAX_ATTEMPTS || 8),
};

/**
 * Queue a receipt. Call inside the investment's transaction. A no-op while Zoho
 * is not configured, so the rows never pile up on a server without it.
 */
async function queueForInvestment(tx, investment) {
  if (!(await zoho.enabled())) return null;
  // A member a super admin switched off in Zoho gets no invoice.
  const member = await tx.user.findUnique({ where: { id: investment.userId }, select: { zohoEnabled: true } });
  if (member && member.zohoEnabled === false) return null;
  return tx.receipt.create({
    data: {
      investmentId: investment.id,
      userId: investment.userId,
      amount: investment.amount,
      currency: zoho.CURRENCY,
    },
  });
}

const backoff = (attempts) =>
  CONFIG.backoffBaseMs * 2 ** Math.min(attempts - 1, 6) * (0.75 + Math.random() * 0.5);

const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

async function claimBatch(limit = CONFIG.batchSize) {
  const now = new Date();
  const candidates = await prisma.receipt.findMany({
    where: {
      runAfter: { lte: now },
      OR: [{ status: 'PENDING' }, { status: 'ISSUED', emailedAt: null }],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, runAfter: true },
  });
  const claimed = [];
  for (const c of candidates) {
    const won = await prisma.receipt.updateMany({
      where: { id: c.id, runAfter: c.runAfter },
      data: { runAfter: new Date(Date.now() + CONFIG.claimMs), attempts: { increment: 1 } },
    });
    if (won.count) claimed.push(c.id);
  }
  return claimed;
}

async function processReceipt(id) {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      user: { include: { profile: true } },
      investment: { include: { project: { select: { title: true } } } },
    },
  });
  if (!receipt) return;
  try {
    let { zohoReceiptId: invoiceId, receiptNumber: invoiceNumber } = receipt;
    const date = isoDate(receipt.investment.investedAt);

    // The customer: already linked (on activation or by the bulk sync), else
    // found by email or created now.
    const customerId = receipt.user.zohoCustomerId || await zoho.findOrCreateCustomer(receipt.user, receipt.user.profile || {});
    if (!receipt.user.zohoCustomerId) {
      await prisma.user.update({ where: { id: receipt.userId }, data: { zohoCustomerId: customerId } });
    }

    // 1. The invoice. Saved straight away so a failure further on never makes
    //    the next attempt create a second one.
    if (!invoiceId) {
      const projectTitle = receipt.investment.project?.title || categoryLabel(receipt.investment.category);
      const made = (await zoho.findInvoiceByReference(receipt.id))
        || await zoho.createInvoice({
          customerId,
          reference: receipt.id,
          date,
          amount: receipt.amount,
          itemName: projectTitle ? `Investment - ${projectTitle}` : 'Investment',
          description: projectTitle
            ? `Capital invested in ${projectTitle}`
            : 'Capital invested with Trillion Business Community',
          notes: receipt.investment.note || 'Thank you for your investment.',
        });
      invoiceId = made.id;
      invoiceNumber = made.number;
      await prisma.receipt.update({
        where: { id },
        data: { zohoCustomerId: customerId, zohoReceiptId: invoiceId, receiptNumber: invoiceNumber, lastError: null },
      });
    }

    // Draft mode: the invoice stays a draft in Zoho. Nothing is sent, paid or
    // emailed until a super admin sends the drafts.
    if (!(await config.resolve()).sendInvoices) {
      await prisma.receipt.update({ where: { id }, data: { status: 'DRAFT', lastError: null } });
      return;
    }

    // 2. The payment, so the invoice is marked paid. Members pay offline before
    //    the investment is booked, so it is always already settled.
    if (!receipt.paymentRecordedAt) {
      await zoho.markInvoiceSent(invoiceId);
      const paid = (await zoho.findPaymentByReference(receipt.id))
        || await zoho.createPayment({ customerId, invoiceId, reference: receipt.id, date, amount: receipt.amount });
      await prisma.receipt.update({
        where: { id },
        data: { status: 'ISSUED', zohoPaymentId: paid.id, paymentRecordedAt: new Date(), issuedAt: new Date(), lastError: null },
      });
    }

    const pdf = await zoho.getInvoicePdf(invoiceId);
    await mailer.sendReceiptEmail({
      user: receipt.user,
      amount: receipt.amount,
      projectTitle: receipt.investment.project?.title || categoryLabel(receipt.investment.category),
      investedAt: receipt.investment.investedAt,
      receiptNumber: invoiceNumber,
      pdf,
    });
    await prisma.receipt.update({ where: { id }, data: { emailedAt: new Date(), lastError: null } });
  } catch (err) {
    console.error(`receipt ${id} failed (attempt ${receipt.attempts}):`, err.message);
    const dead = receipt.attempts >= CONFIG.maxAttempts;
    await prisma.receipt.update({
      where: { id },
      data: {
        lastError: String(err.message).slice(0, 500),
        runAfter: new Date(Date.now() + backoff(receipt.attempts)),
        // An issued receipt whose email keeps failing is still ISSUED: the
        // member can open it from their transactions.
        ...(dead && receipt.status === 'PENDING' ? { status: 'DEAD' } : {}),
        ...(dead && receipt.status === 'ISSUED' ? { emailedAt: new Date() } : {}),
      },
    });
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    if (!(await zoho.enabled())) return;
    for (const id of await claimBatch()) await processReceipt(id);
  } catch (err) {
    console.error('receipt worker tick failed:', err.message);
  } finally {
    running = false;
  }
}

/** Issue straight after commit instead of waiting for the next interval. */
const kick = () => { setImmediate(() => tick().catch(() => {})); };

let timer = null;
function start() {
  if (timer) return;
  // Always runs: tick() asks whether Zoho is configured and switched on each
  // time, so enabling it in the portal needs no restart.
  timer = setInterval(() => tick().catch(() => {}), CONFIG.intervalMs);
  timer.unref?.();
  tick().catch(() => {});
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

/** Super admin: put a DEAD (or stuck) receipt back in the queue. */
async function retry(id) {
  const r = await prisma.receipt.updateMany({
    where: { id, OR: [{ status: 'DEAD' }, { status: 'PENDING' }, { status: 'DRAFT' }] },
    data: { status: 'PENDING', attempts: 0, runAfter: new Date(), lastError: null },
  });
  if (r.count) kick();
  return r.count;
}

/** Super admin: release every draft - mark sent, record the payment, email. */
async function sendDrafts() {
  if (!(await config.resolve()).sendInvoices) {
    throw Object.assign(new Error('Switch to live mode first'), { status: 400 });
  }
  const r = await prisma.receipt.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'PENDING', attempts: 0, runAfter: new Date(), lastError: null },
  });
  if (r.count) kick();
  return r.count;
}

/** Super admin: retry every receipt that gave up. */
async function retryAllDead() {
  const r = await prisma.receipt.updateMany({
    where: { status: 'DEAD' },
    data: { status: 'PENDING', attempts: 0, runAfter: new Date(), lastError: null },
  });
  if (r.count) kick();
  return r.count;
}

module.exports = { queueForInvestment, kick, start, stop, tick, retry, retryAllDead, sendDrafts };
