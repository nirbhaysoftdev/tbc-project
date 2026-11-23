// src/services/zohoBooks.js
//
// A thin client for the parts of the Zoho Books API the portal uses: find or
// create a customer, create an invoice, record the payment against it, fetch
// its PDF. Nothing here knows
// about investments - that is services/receipts.js.
//
// Configuration: Super Admin -> Zoho Books in the portal (services/zohoConfig.js),
// falling back to the ZOHO_* variables below. With the credentials incomplete
// or receipts switched off the feature is off: enabled() is false, no receipt
// rows are queued, and the portal behaves exactly as it did before.
//
//   ZOHO_DC                  com | eu | in | com.au | jp | sa | ca
//   ZOHO_ORG_ID              Zoho Books -> Settings -> Organization Profile
//   ZOHO_CLIENT_ID           api-console.zoho.<dc>  (Self Client)
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN       scopes: ZohoBooks.contacts.CREATE,READ
//                                    ZohoBooks.invoices.CREATE,READ
//                                    ZohoBooks.customerpayments.CREATE,READ
//   ZOHO_DEPOSIT_ACCOUNT_ID  required: the bank/cash account the payment is recorded to
//   ZOHO_PAYMENT_MODE        optional, default "Bank Transfer"
//
// Everything is in euro. The organisation's base currency must be EUR.

const CURRENCY = 'EUR';

const DOMAINS = {
  com:      { accounts: 'https://accounts.zoho.com',    api: 'https://www.zohoapis.com' },
  eu:       { accounts: 'https://accounts.zoho.eu',     api: 'https://www.zohoapis.eu' },
  in:       { accounts: 'https://accounts.zoho.in',     api: 'https://www.zohoapis.in' },
  'com.au': { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au' },
  jp:       { accounts: 'https://accounts.zoho.jp',     api: 'https://www.zohoapis.jp' },
  sa:       { accounts: 'https://accounts.zoho.sa',     api: 'https://www.zohoapis.sa' },
  ca:       { accounts: 'https://accounts.zohocloud.ca', api: 'https://www.zohoapis.ca' },
};

const config = require('./zohoConfig');

/** True when the credentials are complete and receipts are switched on. */
async function enabled() {
  const c = await config.resolve();
  return c.ready && c.enabled;
}

let cached = { token: null, expiresAt: 0, for: '' };

async function accessToken(c) {
  const who = `${c.dc}|${c.clientId}|${c.refreshToken}`;
  if (cached.token && cached.for === who && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const url = new URL(`${DOMAINS[c.dc].accounts}/oauth/v2/token`);
  url.search = new URLSearchParams({
    refresh_token: c.refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
  }).toString();
  const res = await fetch(url, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`Zoho token refresh failed: ${body.error || res.status}`);
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000, for: who };
  return cached.token;
}

class ZohoError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(method, path, { query = {}, body, raw = false } = {}) {
  const c = await config.resolve();
  if (!c.credentialsComplete) throw new ZohoError('Zoho Books is not configured');
  const url = new URL(`${DOMAINS[c.dc].api}/books/v3${path}`);
  url.search = new URLSearchParams({ organization_id: c.orgId, ...query }).toString();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${await accessToken(c)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw && res.ok) return Buffer.from(await res.arrayBuffer());
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new ZohoError(`Zoho ${method} ${path}: ${json.message || res.status}`, { code: json.code, status: res.status });
  }
  return json;
}

const clean = (v) => (v == null ? '' : String(v).trim());

function contactPayload(user, profile = {}, contactName, currencyId) {
  const address = {
    address: clean(profile.streetAddress),
    city: clean(profile.city),
    state: clean(profile.state) || clean(profile.province),
    zip: clean(profile.postalCode),
    country: clean(profile.country),
  };
  return {
    contact_name: contactName,
    contact_type: 'customer',
    currency_id: currencyId,
    ...(profile.company ? { company_name: clean(profile.company) } : {}),
    billing_address: address,
    shipping_address: address,
    contact_persons: [{
      first_name: clean(user.name),
      email: user.email,
      ...(profile.phone ? { phone: `${clean(profile.phoneDialCode)} ${clean(profile.phone)}`.trim() } : {}),
      is_primary_contact: true,
    }],
  };
}

let eurId = { id: null, dc: '' };

/** Zoho wants the id of the organisation's EUR currency; the code alone is not reliably honoured. */
async function currencyId() {
  const c = await config.resolve();
  const who = `${c.dc}|${c.orgId}`;
  if (eurId.id && eurId.dc === who) return eurId.id;
  const res = await request('GET', '/settings/currencies');
  const eur = (res.currencies || []).find((x) => x.currency_code === CURRENCY);
  if (!eur) throw new ZohoError(`Add ${CURRENCY} under Zoho Books -> Settings -> Currencies first`);
  eurId = { id: eur.currency_id, dc: who };
  return eurId.id;
}

/** Returns the Zoho customer id for this email, creating the customer (in EUR) if needed. */
async function findOrCreateCustomer(user, profile = {}) {
  const found = await request('GET', '/contacts', { query: { email: user.email } });
  // Only a customer can be invoiced; a vendor or other contact with this email is not reusable.
  const existing = (found.contacts || []).find((c) => c.contact_type === 'customer');
  if (existing) return existing.contact_id;

  const currency = await currencyId();
  const names = [clean(user.name) || user.email, `${clean(user.name)} (${user.email})`];
  let lastErr;
  for (const name of names) {
    try {
      const created = await request('POST', '/contacts', { body: contactPayload(user, profile, name, currency) });
      return created.contact.contact_id;
    } catch (err) {
      lastErr = err;
      if (err.code !== 3062) throw err; // 3062: a contact with this name exists
    }
  }
  throw lastErr;
}

/** Looks an invoice up by our own id (its reference_number), so a retry never creates a second one. */
async function findInvoiceByReference(reference) {
  const res = await request('GET', '/invoices', { query: { reference_number: reference } });
  const hit = (res.invoices || []).find((i) => i.reference_number === reference);
  return hit ? { id: hit.invoice_id, number: hit.invoice_number, status: hit.status } : null;
}

async function createInvoice({ customerId, reference, date, amount, itemName, description, notes }) {
  const res = await request('POST', '/invoices', {
    body: {
      customer_id: customerId,
      date,
      due_date: date,
      reference_number: reference,
      currency_code: CURRENCY,
      line_items: [{ name: itemName, description, rate: amount, quantity: 1 }],
      notes,
    },
  });
  return { id: res.invoice.invoice_id, number: res.invoice.invoice_number, status: res.invoice.status };
}

/** A draft cannot take a payment; sending moves it to open. Already-sent is fine. */
async function markInvoiceSent(id) {
  try {
    await request('POST', `/invoices/${id}/status/sent`);
  } catch (err) {
    if (err.status !== 400) throw err;
  }
}

async function findPaymentByReference(reference) {
  const res = await request('GET', '/customerpayments', { query: { reference_number: reference } });
  const hit = (res.customerpayments || []).find((p) => p.reference_number === reference);
  return hit ? { id: hit.payment_id } : null;
}

/** Records the money received against the invoice, which marks it paid. */
async function createPayment({ customerId, invoiceId, reference, date, amount }) {
  const c = await config.resolve();
  const res = await request('POST', '/customerpayments', {
    body: {
      customer_id: customerId,
      payment_mode: c.paymentMode,
      amount,
      date,
      reference_number: reference,
      account_id: c.depositAccountId,
      invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
    },
  });
  return { id: res.payment.payment_id };
}

async function getInvoicePdf(id) {
  return request('GET', `/invoices/${id}`, { query: { accept: 'pdf' }, raw: true });
}

/**
 * Trades the one-time code from a Self Client's Generate Code tab for the
 * long-lived refresh token. The code works once and expires after the minutes
 * chosen there, so this has to happen straight away.
 */
async function exchangeCode(code) {
  const c = await config.resolve();
  if (!c.dcValid || !c.clientId || !c.clientSecret) {
    throw new ZohoError('Save the data centre, client ID and client secret first');
  }
  const url = new URL(`${DOMAINS[c.dc].accounts}/oauth/v2/token`);
  url.search = new URLSearchParams({
    grant_type: 'authorization_code', code: String(code).trim(),
    client_id: c.clientId, client_secret: c.clientSecret,
  }).toString();
  const res = await fetch(url, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.refresh_token) {
    const why = body.error === 'invalid_code'
      ? 'invalid_code - the code was already used, has expired, or belongs to a different client or data centre. Generate a new one and paste it straight away'
      : (body.error || res.status);
    throw new ZohoError(`Zoho code exchange failed: ${why}`);
  }
  return body.refresh_token;
}

/** Proves the credentials and organisation id work; best-effort org details. */
async function testConnection() {
  await request('GET', '/contacts', { query: { per_page: 1 } });
  let org = {};
  try {
    const c = await config.resolve();
    const res = await request('GET', '/organizations');
    org = (res.organizations || []).find((o) => String(o.organization_id) === String(c.orgId)) || {};
  } catch { /* needs the settings.READ scope; the contacts call already proved the connection */ }
  return { orgName: org.name || null, currency: org.currency_code || null };
}

/** Bank/cash accounts for the "deposit to" dropdown. Needs the banking.READ scope. */
async function listDepositAccounts() {
  const res = await request('GET', '/bankaccounts');
  return (res.bankaccounts || []).map((a) => ({ id: a.account_id, name: a.account_name, type: a.account_type }));
}

module.exports = {
  enabled, CURRENCY, exchangeCode, testConnection, listDepositAccounts, findOrCreateCustomer, findInvoiceByReference,
  createInvoice, markInvoiceSent, findPaymentByReference, createPayment, getInvoicePdf, _resetTokenCache: () => { cached = { token: null, expiresAt: 0, for: '' }; },
};
