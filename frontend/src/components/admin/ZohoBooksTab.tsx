'use client';
// src/components/admin/ZohoBooksTab.tsx
//
// Super Admin -> Zoho Books. Everything the receipt integration needs, so a
// change never means editing the server: the connection (data centre,
// organisation, API client), what a receipt is deposited to, an on/off switch,
// a connection test, and the receipt queue with its failures.
//
// The client secret and refresh token are WRITE-ONLY. The API never returns
// them, only whether one is set, so this form shows "saved" and an empty box:
// typing replaces the stored value, leaving it empty keeps it.
import React, { useCallback, useEffect, useState } from 'react';
import { zohoAPI, formatDateTime } from '@/lib/api';
import '@/styles/projects.css';

interface Settings {
  dc: string; orgId: string; clientId: string;
  depositAccountId: string; depositAccountName: string; paymentMode: string;
  enabled: boolean; sendInvoices: boolean; clientSecretSet: boolean; refreshTokenSet: boolean;
  sources: Record<string, 'portal' | 'env' | null>;
  credentialsComplete: boolean; ready: boolean; missing: string[]; active: boolean; dataCentres: string[];
  customers: { total: number; linked: number; unlinked: number; job: { running: boolean; done: number; failed: number; total: number; lastError: string | null } };
  lastTest: { at: string; ok: boolean; orgName?: string | null; currency?: string | null; warning?: string | null; message?: string } | null;
  updatedAt: string | null; currency: string;
  counts: { PENDING: number; DRAFT: number; ISSUED: number; DEAD: number };
}

const CARD: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
};
const LABEL: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, display: 'block',
};
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 };
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  ISSUED:  { background: 'rgba(46,204,113,0.14)', color: '#5ad68c' },
  PENDING: { background: 'rgba(255,190,50,0.14)', color: '#f0c04a' },
  DRAFT:   { background: 'rgba(120,150,255,0.16)', color: '#8fa8ff' },
  DEAD:    { background: 'rgba(224,82,82,0.14)',  color: '#e8706f' },
};
const PAYMENT_MODES = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'Bank Remittance'];
const DC_LABEL: Record<string, string> = {
  com: 'zoho.com (US)', eu: 'zoho.eu (Europe)', in: 'zoho.in (India)', 'com.au': 'zoho.com.au (Australia)',
  jp: 'zoho.jp (Japan)', sa: 'zoho.sa (Saudi Arabia)', ca: 'zohocloud.ca (Canada)',
};

const errText = (e: any, fallback: string) => e?.response?.data?.error || fallback;

export default function ZohoBooksTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [form, setForm] = useState({
    dc: '', orgId: '', clientId: '', clientSecret: '', refreshToken: '',
    depositAccountId: '', depositAccountName: '', paymentMode: 'Bank Transfer',
  });
  const [code, setCode] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string }[] | null>(null);
  const [accountsErr, setAccountsErr] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = (d: Settings) => {
    setS(d);
    setForm((f) => ({
      ...f, dc: d.dc, orgId: d.orgId, clientId: d.clientId, clientSecret: '', refreshToken: '',
      depositAccountId: d.depositAccountId, depositAccountName: d.depositAccountName, paymentMode: d.paymentMode,
    }));
  };

  const load = useCallback(() => {
    zohoAPI.get().then((r) => apply(r.data)).catch(() => setError('Could not load the Zoho Books settings.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(''); setNotice('');
  };

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setError(''); setNotice('');
    try { await fn(); } catch (e: any) { setError(errText(e, 'That did not work.')); } finally { setBusy(''); }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const body: Record<string, unknown> = {
        dc: form.dc, orgId: form.orgId, clientId: form.clientId,
        depositAccountId: form.depositAccountId, depositAccountName: form.depositAccountName,
        paymentMode: form.paymentMode,
      };
      if (form.clientSecret.trim()) body.clientSecret = form.clientSecret.trim();
      if (form.refreshToken.trim()) body.refreshToken = form.refreshToken.trim();
      const r = await zohoAPI.save(body);
      apply(r.data);
      setNotice('Saved. Use “Test connection” to check it works.');
    });
  };

  const setMode = (send: boolean) => run('mode', async () => {
    if (send && !window.confirm('Switch to LIVE? From now on every new invoice is marked sent, its payment is recorded and the member is emailed. Existing drafts stay drafts until you release them.')) return;
    const r = await zohoAPI.save({ sendInvoices: send });
    apply(r.data);
    setNotice(send ? 'Live: new invoices are sent, paid and emailed.' : 'Draft only: new invoices are created in Zoho as drafts and nothing is sent.');
  });

  const sendDrafts = () => {
    if (!window.confirm(`Release ${s?.counts.DRAFT} draft invoice(s)? Each is marked sent in Zoho, its payment is recorded and the member is emailed the PDF. This cannot be undone from here.`)) return;
    run('drafts', async () => { const r = await zohoAPI.sendDrafts(); setNotice(`${r.data.queued} draft invoice(s) released.`); load(); });
  };

  const toggle = () => run('toggle', async () => {
    const r = await zohoAPI.save({ enabled: !s?.enabled });
    apply(r.data);
    setNotice(r.data.enabled ? 'Invoicing is on for new investments.' : 'Invoicing is off. New investments will not get an invoice.');
  });

  const exchange = () => run('exchange', async () => {
    const r = await zohoAPI.exchangeCode(code.trim());
    apply(r.data); setCode('');
    setNotice('Refresh token saved. Now use “Test connection”.');
  });

  const test = () => run('test', async () => {
    try {
      const r = await zohoAPI.test();
      apply(r.data.settings);
      setNotice(`Connected${r.data.orgName ? ` to “${r.data.orgName}”` : ''}.`);
    } catch (e: any) {
      if (e?.response?.data?.settings) apply(e.response.data.settings);
      throw e;
    }
  });

  const loadAccounts = () => run('accounts', async () => {
    setAccountsErr('');
    try { setAccounts((await zohoAPI.accounts()).data.accounts); }
    catch (e: any) { setAccounts(null); setAccountsErr(errText(e, 'Could not load accounts.')); }
  });

  const disconnect = () => {
    if (!window.confirm('Remove the stored client secret and refresh token? Invoicing stops until new ones are saved. Invoices already created are not affected.')) return;
    run('disconnect', async () => { apply((await zohoAPI.save({ disconnect: true })).data); setNotice('Credentials removed.'); });
  };

  if (!s) return <div style={CARD}>{error || 'Loading…'}</div>;

  const src = (k: string) => s.sources[k] === 'env' ? <span style={HINT}> · currently from the server environment</span> : null;
  const status = !s.ready ? 'Not configured' : s.enabled ? 'Active' : 'Switched off';
  const statusStyle = !s.ready ? STATUS_STYLE.PENDING : s.enabled ? STATUS_STYLE.ISSUED : STATUS_STYLE.DEAD;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Zoho Books</h3>
          <span style={{ ...statusStyle, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>{status}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="pj-btn pj-btn-ghost" disabled={!!busy || !s.ready} onClick={toggle}>
            {s.enabled ? 'Switch invoicing off' : 'Switch invoicing on'}
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '10px 0 8px' }}>
          Every investment creates an <strong>invoice in {s.currency}</strong> in Zoho Books and records the payment
          against it, so it shows as paid. The member is emailed the PDF and can open it from Transactions; a super admin
          can open any. A Zoho outage only delays an invoice, never an investment. Only investments made while this is{' '}
          <strong>Active</strong> get one. Members become Zoho customers when their account is activated.
          {s.credentialsComplete && !s.ready && <> <strong>Choose a deposit account below to activate it</strong> — the payment has to be recorded to one.</>}
        </p>
        <div className={s.sendInvoices ? 'pj-callout pj-callout-warn' : 'pj-callout'} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <strong>{s.sendInvoices ? 'Live' : 'Draft only'}</strong> —{' '}
            {s.sendInvoices
              ? 'new invoices are marked sent, paid and emailed to the member.'
              : 'new invoices are created in Zoho as drafts. Nothing is sent, paid or emailed. Check them in Zoho, then go live and release them.'}
          </div>
          <button type="button" className="pj-btn pj-btn-ghost" disabled={!!busy} onClick={() => setMode(!s.sendInvoices)}>
            {s.sendInvoices ? 'Back to draft only' : 'Go live'}
          </button>
          {s.counts.DRAFT > 0 && s.sendInvoices && (
            <button type="button" className="pj-btn pj-btn-primary" disabled={!!busy} onClick={sendDrafts}>Send {s.counts.DRAFT} draft(s)</button>
          )}
        </div>
        <div className="pj-callout">
          The organisation&apos;s base currency in Zoho must be {s.currency}. Credentials are stored encrypted and are never
          shown again after saving. Every change is recorded in Logs with your name.
        </div>
      </div>

      {error  && <div className="pj-error">{error}</div>}
      {notice && <div className="pj-ok">{notice}</div>}

      <form style={CARD} onSubmit={save}>
        <span style={LABEL}>Connection</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <label style={LABEL} htmlFor="z-dc">Data centre</label>
            <select id="z-dc" className="pj-select" value={form.dc} onChange={set('dc')}>
              <option value="">Select…</option>
              {s.dataCentres.map((d) => <option key={d} value={d}>{DC_LABEL[d] || d}</option>)}
            </select>
            <div style={HINT}>The domain you log in to Zoho on.{src('dc')}</div>
          </div>
          <div>
            <label style={LABEL} htmlFor="z-org">Organisation ID</label>
            <input id="z-org" className="pj-input" value={form.orgId} onChange={set('orgId')} inputMode="numeric" />
            <div style={HINT}>Zoho Books → Settings → Organization Profile.{src('orgId')}</div>
          </div>
          <div>
            <label style={LABEL} htmlFor="z-cid">Client ID</label>
            <input id="z-cid" className="pj-input" value={form.clientId} onChange={set('clientId')} autoComplete="off" />
            <div style={HINT}>From a Self Client at api-console.zoho.&lt;region&gt;.{src('clientId')}</div>
          </div>
          <div>
            <label style={LABEL} htmlFor="z-sec">Client secret {s.clientSecretSet && <span style={{ color: '#5ad68c' }}>· saved</span>}</label>
            <input id="z-sec" className="pj-input" type="password" value={form.clientSecret} onChange={set('clientSecret')}
              autoComplete="new-password" placeholder={s.clientSecretSet ? 'Leave empty to keep the saved one' : ''} />
            <div style={HINT}>Write-only.{src('clientSecret')}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL} htmlFor="z-code">Have a one-time code? Exchange it here</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input id="z-code" className="pj-input" style={{ flex: '1 1 320px' }} value={code}
                onChange={(e) => setCode(e.target.value)} autoComplete="off"
                placeholder="1000.xxxxxxxx.xxxxxxxx  (from the Self Client’s Generate Code tab)" />
              <button type="button" className="pj-btn pj-btn-primary" disabled={!!busy || !code.trim() || !s.clientSecretSet || !form.clientId}
                onClick={exchange}>{busy === 'exchange' ? 'Exchanging…' : 'Exchange for refresh token'}</button>
            </div>
            <div style={HINT}>
              The code from Generate Code is <strong>not</strong> a refresh token: it works once and expires in the minutes you chose.
              Save the data centre, client ID and secret first, then paste the code here straight after generating it — the
              refresh token is created and saved for you. Don&apos;t paste a code into the refresh token box.
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL} htmlFor="z-ref">Refresh token {s.refreshTokenSet && <span style={{ color: '#5ad68c' }}>· saved</span>}</label>
            <input id="z-ref" className="pj-input" type="password" value={form.refreshToken} onChange={set('refreshToken')}
              autoComplete="new-password" placeholder={s.refreshTokenSet ? 'Leave empty to keep the saved one' : ''} />
            <div style={HINT}>
              Generate a code in the Self Client with scopes{' '}
              <code>ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ,ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ,
              ZohoBooks.customerpayments.CREATE,ZohoBooks.customerpayments.READ</code>{' '}
              (add <code>ZohoBooks.settings.READ</code> and{' '}
              <code>ZohoBooks.banking.READ</code> for the organisation name and account list), exchange it for a refresh token and paste it here.{src('refreshToken')}
            </div>
          </div>
        </div>

        <span style={{ ...LABEL, marginTop: 22 }}>Payment defaults</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <label style={LABEL} htmlFor="z-pm">Payment mode</label>
            <input id="z-pm" className="pj-input" list="z-pm-list" value={form.paymentMode} onChange={set('paymentMode')} />
            <datalist id="z-pm-list">{PAYMENT_MODES.map((m) => <option key={m} value={m} />)}</datalist>
            <div style={HINT}>Must match a payment mode that exists in your Zoho organisation.{src('paymentMode')}</div>
          </div>
          <div>
            <label style={LABEL} htmlFor="z-dep">Deposit to account *</label>
            {accounts ? (
              <select id="z-dep" className="pj-select" value={form.depositAccountId}
                onChange={(e) => {
                  const a = accounts.find((x) => x.id === e.target.value);
                  setForm((f) => ({ ...f, depositAccountId: e.target.value, depositAccountName: a?.name || '' }));
                }}>
                <option value="">Select an account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            ) : (
              <input id="z-dep" className="pj-input" value={form.depositAccountId} onChange={set('depositAccountId')}
                placeholder="Account id (required)" />
            )}
            <div style={HINT}>
              Required: every invoice's payment is recorded to this account.{' '}
              {form.depositAccountName && <>Currently: <strong>{form.depositAccountName}</strong>. </>}
              <button type="button" className="pj-btn pj-btn-ghost" style={{ padding: '2px 10px', fontSize: 11 }}
                disabled={!!busy || !s.credentialsComplete} onClick={loadAccounts}>
                {busy === 'accounts' ? 'Loading…' : 'Load my Zoho accounts'}
              </button>
              {accountsErr && <span style={{ color: '#e8706f' }}> {accountsErr}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          <button type="submit" className="pj-btn pj-btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button type="button" className="pj-btn pj-btn-ghost" disabled={!!busy || !s.credentialsComplete} onClick={test}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          <span style={{ flex: 1 }} />
          {(s.sources.clientSecret === 'portal' || s.sources.refreshToken === 'portal') && (
            <button type="button" className="pj-btn pj-btn-ghost" disabled={!!busy} onClick={disconnect}>Remove saved credentials</button>
          )}
        </div>

        {s.lastTest && (
          <div style={{ ...HINT, marginTop: 14 }}>
            Last test {formatDateTime(s.lastTest.at)}:{' '}
            {s.lastTest.ok
              ? <span style={{ color: '#5ad68c' }}>connected{s.lastTest.orgName ? ` to ${s.lastTest.orgName}` : ''}{s.lastTest.currency ? ` (${s.lastTest.currency})` : ''}</span>
              : <span style={{ color: '#e8706f' }}>{s.lastTest.message || 'failed'}</span>}
            {s.lastTest.warning && <div className="pj-callout pj-callout-warn" style={{ marginTop: 8 }}>{s.lastTest.warning}</div>}
          </div>
        )}
        {s.updatedAt && <div style={HINT}>Settings last saved {formatDateTime(s.updatedAt)}.</div>}
      </form>

      <div style={CARD}>
        <span style={LABEL}>Customers</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <strong>{s.customers.linked}</strong> of <strong>{s.customers.total}</strong> active members are linked to a Zoho Books customer.
          </div>
          <button type="button" className="pj-btn pj-btn-ghost" disabled={!!busy || !s.active || !s.sendInvoices || s.customers.unlinked === 0 || s.customers.job.running}
            onClick={() => run('sync', async () => { await zohoAPI.syncCustomers(); setNotice('Syncing members in the background. Reload this tab to see progress.'); load(); })}>
            {s.customers.job.running ? `Syncing… ${s.customers.job.done}/${s.customers.job.total}` : `Sync ${s.customers.unlinked} existing member(s)`}
          </button>
        </div>
        <div style={HINT}>
          A member is added to Zoho Books as a customer when their account is activated. An existing Zoho customer with the
          same email is linked, not duplicated. This button links members who were activated before this was switched on.
          {!s.sendInvoices && <strong> Held back in draft mode: no customers are created in Zoho Books except the one an investment&apos;s own draft invoice needs.</strong>}
          {s.customers.job.failed > 0 && <span style={{ color: '#e8706f' }}> {s.customers.job.failed} failed{s.customers.job.lastError ? `: ${s.customers.job.lastError}` : ''}.</span>}
        </div>
      </div>
    </div>
  );
}
