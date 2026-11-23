// src/controllers/zohoController.js
//
// Super Admin -> Zoho Books. Every route is behind requireSuperAdmin (see
// routes/superAdmin.js). Secrets are write-only: nothing here ever returns the
// client secret or refresh token, only whether one is set and where it came from.
const prisma = require('../utils/prismaClient');
const config = require('../services/zohoConfig');
const zoho = require('../services/zohoBooks');
const receipts = require('../services/receipts');
const customers = require('../services/zohoCustomers');
const { logActivity } = require('../services/activityLog');

const actor = (req) => ({ actorId: req.user.id, actorName: req.user.name });

async function view() {
  const c = await config.resolve();
  const counts = await prisma.receipt.groupBy({ by: ['status'], _count: { _all: true } });
  return {
    dc: c.dc, orgId: c.orgId, clientId: c.clientId,
    depositAccountId: c.depositAccountId, depositAccountName: c.depositAccountName,
    paymentMode: c.paymentMode, enabled: c.enabled, sendInvoices: c.sendInvoices,
    clientSecretSet: Boolean(c.clientSecret), refreshTokenSet: Boolean(c.refreshToken),
    sources: c.sources,
    credentialsComplete: c.credentialsComplete,
    ready: c.ready,
    missing: [
      ...(c.credentialsComplete ? [] : ['connection details']),
      ...(c.sendInvoices && !c.depositAccountId ? ['deposit account'] : []),
    ],
    active: c.ready && c.enabled,
    customers: { ...(await customers.counts()), job: customers.progress() },
    dataCentres: config.DATA_CENTRES,
    lastTest: c.lastTest, updatedAt: c.updatedAt,
    currency: zoho.CURRENCY,
    counts: Object.fromEntries(['PENDING', 'DRAFT', 'ISSUED', 'DEAD'].map((s) => [s, counts.find((r) => r.status === s)?._count._all || 0])),
  };
}

const getSettings = async (req, res) => {
  try { res.json(await view()); } catch (e) { console.error('zoho get:', e); res.status(500).json({ error: 'Server error' }); }
};

const updateSettings = async (req, res) => {
  try {
    const b = req.body || {};
    if (b.dc != null && b.dc !== '' && !config.DATA_CENTRES.includes(String(b.dc).trim().toLowerCase())) {
      return res.status(400).json({ error: `Data centre must be one of: ${config.DATA_CENTRES.join(', ')}` });
    }
    if (b.orgId != null && b.orgId !== '' && !/^\d{4,20}$/.test(String(b.orgId).trim())) {
      return res.status(400).json({ error: 'Organisation ID is the number shown in Zoho Books under Organization Profile' });
    }
    for (const k of ['clientId', 'depositAccountId', 'depositAccountName', 'paymentMode', 'clientSecret', 'refreshToken']) {
      if (b[k] != null && String(b[k]).length > 300) return res.status(400).json({ error: `${k} is too long` });
    }
    const patch = {};
    for (const k of ['dc', 'orgId', 'clientId', 'depositAccountId', 'depositAccountName', 'paymentMode', 'clientSecret', 'refreshToken', 'enabled', 'sendInvoices', 'disconnect']) {
      if (k in b) patch[k] = b[k];
    }
    if (patch.dc) patch.dc = String(patch.dc).trim().toLowerCase();
    await config.save(patch);
    zoho._resetTokenCache();

    // Which fields changed - never their values.
    const changed = Object.keys(patch).filter((k) => !['disconnect'].includes(k) && patch[k] !== '' && patch[k] != null);
    logActivity({
      type: 'ZOHO_SETTINGS_UPDATED', title: patch.disconnect ? 'Zoho Books disconnected' : 'Zoho Books settings changed',
      description: patch.disconnect ? 'Stored credentials removed' : `Changed: ${changed.join(', ') || 'nothing'}`,
      ...actor(req), metadata: { fields: changed, disconnect: Boolean(patch.disconnect) },
    });
    res.json(await view());
  } catch (e) {
    console.error('zoho update:', e);
    res.status(500).json({ error: 'Could not save the Zoho Books settings' });
  }
};

const exchangeCode = async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Paste the code from the Self Client first' });
  try {
    const refreshToken = await zoho.exchangeCode(code);
    await config.save({ refreshToken });
    zoho._resetTokenCache();
    logActivity({ type: 'ZOHO_SETTINGS_UPDATED', title: 'Zoho Books refresh token issued', description: 'Exchanged a Self Client code', ...actor(req) });
    res.json(await view());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

const testConnection = async (req, res) => {
  const c = await config.resolve();
  if (!c.credentialsComplete) {
    return res.status(400).json({ error: 'Enter the data centre, organisation ID, client ID, client secret and refresh token first' });
  }
  try {
    const org = await zoho.testConnection();
    const warning = org.currency && org.currency !== zoho.CURRENCY
      ? `The organisation's currency is ${org.currency}, not ${zoho.CURRENCY}. Receipts are issued in ${zoho.CURRENCY} and Zoho may reject them.`
      : null;
    await config.recordTest({ ok: true, orgName: org.orgName, currency: org.currency, warning });
    logActivity({ type: 'ZOHO_CONNECTION_TESTED', title: 'Zoho Books connection tested', description: org.orgName || 'Connected', ...actor(req) });
    res.json({ ok: true, ...org, warning, settings: await view() });
  } catch (e) {
    await config.recordTest({ ok: false, message: String(e.message).slice(0, 300) });
    logActivity({ type: 'ZOHO_CONNECTION_TESTED', status: 'FAILED', title: 'Zoho Books connection test failed', description: String(e.message).slice(0, 200), ...actor(req) });
    res.status(502).json({ ok: false, error: e.message, settings: await view() });
  }
};

const listAccounts = async (req, res) => {
  try {
    res.json({ accounts: await zoho.listDepositAccounts() });
  } catch (e) {
    // Needs the ZohoBooks.banking.READ scope; the form falls back to typing the id.
    res.status(502).json({ error: e.message, accounts: [] });
  }
};

const listReceipts = async (req, res) => {
  try {
    const { status } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const q = String(req.query.q || '').trim();
    const where = {
      ...(['PENDING', 'DRAFT', 'ISSUED', 'DEAD'].includes(status) ? { status } : {}),
      ...(q ? { OR: [
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { receiptNumber: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.receipt.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.receipt.count({ where }),
    ]);
    res.json({
      receipts: rows.map((r) => ({
        id: r.id, investmentId: r.investmentId, status: r.status, amount: r.amount, currency: r.currency,
        receiptNumber: r.receiptNumber, attempts: r.attempts, lastError: r.lastError,
        issuedAt: r.issuedAt, emailedAt: r.emailedAt, createdAt: r.createdAt, user: r.user,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error('zoho receipts:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

const retryDead = async (req, res) => {
  const n = await receipts.retryAllDead();
  logActivity({ type: 'ZOHO_SETTINGS_UPDATED', title: 'Failed receipts retried', description: `${n} receipt(s) re-queued`, ...actor(req) });
  res.json({ retried: n });
};

const syncCustomers = async (req, res) => {
  if (!(await zoho.enabled())) {
    return res.status(400).json({ error: 'Finish the connection and deposit account, and switch Zoho Books on, first' });
  }
  if (!(await config.resolve()).sendInvoices) {
    return res.status(400).json({ error: 'Syncing members creates customers in Zoho Books. It is held back in draft mode - go live first' });
  }
  const job = customers.syncAll();
  logActivity({ type: 'ZOHO_SETTINGS_UPDATED', title: 'Members synced to Zoho Books', description: `${job.total} member(s) queued`, ...actor(req) });
  res.json({ job });
};

const sendDrafts = async (req, res) => {
  try {
    const n = await receipts.sendDrafts();
    logActivity({ type: 'ZOHO_SETTINGS_UPDATED', title: 'Draft invoices released', description: `${n} draft invoice(s) queued to send`, ...actor(req) });
    res.json({ queued: n });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
};

/** Per-member switch: off = no invoice and no customer for this member. */
const setMemberZoho = async (req, res) => {
  const enabled = req.body.enabled === true || req.body.enabled === 'true';
  const member = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, role: true, deletedAt: true } });
  if (!member || member.deletedAt || member.role !== 'MEMBER') return res.status(404).json({ error: 'Member not found' });
  await prisma.user.update({ where: { id: member.id }, data: { zohoEnabled: enabled } });
  logActivity({
    type: 'ZOHO_SETTINGS_UPDATED',
    title: `Zoho Books ${enabled ? 'enabled' : 'disabled'} for ${member.name}`,
    description: enabled ? 'New investments will be invoiced in Zoho Books.' : 'New investments will not be invoiced in Zoho Books.',
    targetId: member.id, targetName: member.name, ...actor(req),
  });
  res.json({ zohoEnabled: enabled });
};

/** Every member with their Zoho switch, plus the totals the panel's counters show. */
const listMembers = async (req, res) => {
  try {
    const base = { role: 'MEMBER', deletedAt: null };
    const q = String(req.query.q || '').trim();
    const filter = req.query.filter === 'enabled' ? { zohoEnabled: true } : req.query.filter === 'disabled' ? { zohoEnabled: false } : {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const where = {
      ...base, ...filter,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, matched, total, enabled] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit,
        select: { id: true, name: true, email: true, status: true, zohoEnabled: true, zohoCustomerId: true },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: base }),
      prisma.user.count({ where: { ...base, zohoEnabled: true } }),
    ]);
    res.json({
      totals: { total, enabled, disabled: total - enabled },
      members: rows.map((m) => ({ ...m, linked: Boolean(m.zohoCustomerId), zohoCustomerId: undefined })),
      pagination: { page, limit, total: matched, totalPages: Math.ceil(matched / limit) },
    });
  } catch (e) {
    console.error('zoho members:', e);
    res.status(500).json({ error: 'Could not load members' });
  }
};

module.exports = { listMembers, setMemberZoho, exchangeCode, sendDrafts, syncCustomers, getSettings, updateSettings, testConnection, listAccounts, listReceipts, retryDead };
