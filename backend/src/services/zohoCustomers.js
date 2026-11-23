// src/services/zohoCustomers.js
//
// Keeps a member's customer record in Zoho Books. A member becomes a customer
// when their account is activated (approved, or created active by an admin),
// and an invoice creates one on the spot if it still has to - so nothing
// depends on this running first. Existing members are linked in bulk from
// Super Admin -> Zoho Books.
//
// The link is `users.zohoCustomerId`. findOrCreateCustomer() matches an
// existing Zoho customer by email before creating, so linking never duplicates.
const prisma = require('../utils/prismaClient');
const zoho = require('./zohoBooks');
const config = require('./zohoConfig');

/**
 * Link one member. Returns the Zoho customer id, or null when Zoho is off - or
 * in draft mode, where the only thing allowed to touch Zoho is an investment's
 * own invoice (which creates its customer itself). Going live switches the
 * activation hook and the bulk sync on.
 */
async function syncMember(userId, { force = false } = {}) {
  if (!(await zoho.enabled())) return null;
  // An admin who ticked "create a Zoho customer" asked for this one member, so
  // draft mode does not hold it back; the bulk sync and nothing else still does.
  if (!force && !(await config.resolve()).sendInvoices) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user || user.deletedAt || user.role !== 'MEMBER' || user.zohoEnabled === false) return null;
  if (user.zohoCustomerId) return user.zohoCustomerId;
  const id = await zoho.findOrCreateCustomer(user, user.profile || {});
  await prisma.user.update({ where: { id: userId }, data: { zohoCustomerId: id } });
  return id;
}

/** Fire and forget: activating a member must never wait on, or fail because of, Zoho. */
function syncMemberSoon(userId, opts) {
  Promise.resolve().then(() => syncMember(userId, opts))
    .catch((e) => console.error(`zoho customer sync failed (${userId}):`, e.message));
}

/**
 * The admin's choice at activation. `raw` is the form value: undefined means
 * the form did not offer it (Zoho off), so nothing changes. Ticked links the
 * member now; unticked switches them off so they are never invoiced.
 */
function applyChoice(userId, raw) {
  if (raw === undefined) return;
  const on = raw === true || raw === 'true' || raw === 1 || raw === '1';
  prisma.user.update({ where: { id: userId }, data: { zohoEnabled: on } })
    .then(() => { if (on) return syncMember(userId, { force: true }); })
    .catch((e) => console.error(`zoho choice failed (${userId}):`, e.message));
}

const MEMBERS = { role: 'MEMBER', status: 'ACTIVE', deletedAt: null, zohoEnabled: true };

async function counts() {
  const [total, linked] = await Promise.all([
    prisma.user.count({ where: MEMBERS }),
    prisma.user.count({ where: { ...MEMBERS, zohoCustomerId: { not: null } } }),
  ]);
  return { total, linked, unlinked: total - linked };
}

let job = { running: false, done: 0, failed: 0, total: 0, startedAt: null, lastError: null };

/** Link every active member that is not linked yet, one at a time (Zoho rate-limits). */
function syncAll() {
  if (job.running) return { ...job };
  job = { running: true, done: 0, failed: 0, total: 0, startedAt: new Date().toISOString(), lastError: null };
  (async () => {
    const pending = await prisma.user.findMany({
      where: { ...MEMBERS, zohoCustomerId: null }, select: { id: true }, orderBy: { createdAt: 'asc' },
    });
    job.total = pending.length;
    for (const { id } of pending) {
      try { await syncMember(id); job.done += 1; }
      catch (e) { job.failed += 1; job.lastError = String(e.message).slice(0, 200); }
      await new Promise((r) => setTimeout(r, 700));
    }
  })().catch((e) => { job.lastError = String(e.message).slice(0, 200); })
    .finally(() => { job.running = false; });
  return { ...job };
}

const progress = () => ({ ...job });

module.exports = { syncMember, syncMemberSoon, applyChoice, syncAll, counts, progress };
