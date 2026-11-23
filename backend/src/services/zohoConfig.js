// src/services/zohoConfig.js
//
// Where the Zoho Books settings live. Super admin edits them in the portal
// (Super Admin -> Zoho Books); they are stored as one JSON document in
// SystemConfig, with the client secret and refresh token encrypted. Anything
// not set there falls back to the ZOHO_* environment variables, so a server
// configured the old way keeps working and the portal value wins once set.
const prisma = require('../utils/prismaClient');
const { encrypt, decrypt } = require('./secretBox');

const KEY = 'zohoBooksConfig';
const TTL_MS = 10_000;

const DATA_CENTRES = ['com', 'eu', 'in', 'com.au', 'jp', 'sa', 'ca'];
const TEXT = ['dc', 'orgId', 'clientId', 'depositAccountId', 'depositAccountName', 'paymentMode'];
const SECRET = ['clientSecret', 'refreshToken'];

let cache = { at: 0, value: null };

async function readStored() {
  if (cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  let value = {};
  try { value = row ? JSON.parse(row.value) : {}; } catch { value = {}; }
  cache = { at: Date.now(), value };
  return value;
}

async function writeStored(next) {
  await prisma.systemConfig.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(next) },
    create: { key: KEY, value: JSON.stringify(next) },
  });
  cache = { at: Date.now(), value: next };
}

const env = {
  dc: () => (process.env.ZOHO_DC || '').trim().toLowerCase(),
  orgId: () => (process.env.ZOHO_ORG_ID || '').trim(),
  clientId: () => (process.env.ZOHO_CLIENT_ID || '').trim(),
  clientSecret: () => (process.env.ZOHO_CLIENT_SECRET || '').trim(),
  refreshToken: () => (process.env.ZOHO_REFRESH_TOKEN || '').trim(),
  depositAccountId: () => (process.env.ZOHO_DEPOSIT_ACCOUNT_ID || '').trim(),
  depositAccountName: () => '',
  paymentMode: () => (process.env.ZOHO_PAYMENT_MODE || '').trim(),
};

/** The effective settings, secrets decrypted. Server-side use only. */
async function resolve() {
  const s = await readStored();
  const out = { enabled: s.enabled !== false, sources: {} };
  // Draft mode (the default): invoices are created in Zoho as drafts and nothing
  // is sent, paid or emailed. Live mode does all of it. ZOHO_SEND_INVOICES=true
  // is the environment fallback.
  out.sendInvoices = s.sendInvoices !== undefined ? Boolean(s.sendInvoices) : process.env.ZOHO_SEND_INVOICES === 'true';
  for (const k of TEXT) {
    out[k] = (s[k] || '').trim() || env[k]();
    out.sources[k] = s[k] ? 'portal' : env[k]() ? 'env' : null;
  }
  for (const k of SECRET) {
    const stored = decrypt(s[k]);
    out[k] = stored || env[k]();
    out.sources[k] = stored ? 'portal' : env[k]() ? 'env' : null;
  }
  out.paymentMode = out.paymentMode || 'Bank Transfer';
  out.lastTest = s.lastTest || null;
  out.updatedAt = s.updatedAt || null;
  out.dcValid = DATA_CENTRES.includes(out.dc);
  out.credentialsComplete = Boolean(out.dcValid && out.orgId && out.clientId && out.clientSecret && out.refreshToken);
  // Recording a payment needs the account it was deposited to.
  out.ready = out.credentialsComplete && (!out.sendInvoices || Boolean(out.depositAccountId));
  return out;
}

/**
 * Apply a change. Text fields: a string replaces, '' clears (back to the
 * environment value). Secrets: only a non-empty string replaces - an empty or
 * missing one leaves the stored secret alone, so saving the form never wipes it.
 */
async function save(patch = {}) {
  const s = { ...(await readStored()) };
  for (const k of TEXT) if (k in patch) s[k] = String(patch[k] ?? '').trim();
  for (const k of SECRET) {
    const v = patch[k] == null ? '' : String(patch[k]).trim();
    if (v) s[k] = encrypt(v);
  }
  if ('enabled' in patch) s.enabled = Boolean(patch.enabled);
  if ('sendInvoices' in patch) s.sendInvoices = Boolean(patch.sendInvoices);
  if (patch.disconnect) for (const k of SECRET) delete s[k];
  s.updatedAt = new Date().toISOString();
  await writeStored(s);
}

async function recordTest(result) {
  const s = { ...(await readStored()), lastTest: { at: new Date().toISOString(), ...result } };
  await writeStored(s);
}

const invalidate = () => { cache = { at: 0, value: null }; };

module.exports = { resolve, save, recordTest, invalidate, DATA_CENTRES, KEY };
