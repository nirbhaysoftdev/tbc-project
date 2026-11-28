'use client';
// The Aladino Shares admin. Its own login, held in sessionStorage for the tab
// only; it is not a portal session and the portal never sees it.
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from './Chrome';
import {
  OFFERING_LABEL, Offering, ShareApiError, ShareBooking, ShareState, eur, fmtDate, pct, shareCsv, shareFetch,
} from '@/lib/aladinoShares';

type Data = { offerings: Record<Offering, ShareState>; bookings: ShareBooking[] };
type Scope = 'all' | Offering;
const OFFERINGS: Offering[] = ['aladino', 'real-estate'];
type Filter = 'active' | 'cancelled' | 'all';
const KEY = 'tbc_aladino_shares_admin';

const readToken = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const writeToken = (t: string | null) => {
  try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* private mode */ }
};

export default function SharesAdmin() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [D, setD] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [scope, setScope] = useState<Scope>('all');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [loginErr, setLoginErr] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [totalIn, setTotalIn] = useState('');
  const totalFocus = useRef(false);
  const flashT = useRef<ReturnType<typeof setTimeout>>();

  const flash = (t: string, ok = true) => {
    setMsg({ t, ok });
    clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setMsg(null), 3500);
  };

  const logout = useCallback(() => { writeToken(null); setToken(null); setD(null); }, []);

  const load = useCallback(async (tk: string | null = token) => {
    if (!tk) return;
    try {
      const d = await shareFetch<Data>('/admin/data', { token: tk });
      setD(d);
    } catch (e) {
      if ((e as ShareApiError).status === 401) logout();
    }
  }, [token, logout]);

  useEffect(() => { const t = readToken(); setToken(t); setReady(true); }, []);
  useEffect(() => { if (token) load(token); }, [token, load]);
  // The total box follows the selected offering until the admin is typing in it.
  useEffect(() => {
    if (D && scope !== 'all' && !totalFocus.current) setTotalIn(String(D.offerings[scope].totalShares));
  }, [D, scope]);
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => clearInterval(id);
  }, [token, load]);

  // Every admin call: re-login on 401, show any other error.
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); flash(ok); await load(); return true; }
    catch (e) {
      const ex = e as ShareApiError;
      if (ex.status === 401) logout(); else flash(ex.message, false);
      return false;
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    try {
      const d = await shareFetch<{ token: string }>('/admin/login', { body: { email, password: pw } });
      writeToken(d.token); setPw(''); setToken(d.token);
    } catch (err) { setLoginErr((err as Error).message); }
  };

  const setting = (body: object, ok: string) => run(() => shareFetch('/admin/settings', { body, token }), ok);
  const act = (b: ShareBooking, action: 'cancel' | 'restore' | 'delete', confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    run(() => shareFetch(`/admin/bookings/${b.id}/${action}`, { body: {}, token }),
      { cancel: 'Booking undone — shares returned to available.', restore: 'Booking restored.', delete: 'Request deleted.' }[action]);
  };

  const list = D ? D.bookings.filter((b) =>
    (scope === 'all' || b.offering === scope) && (filter === 'all' || b.status === filter)) : [];
  const S = D && scope !== 'all' ? D.offerings[scope] : null;
  const live = D ? D.bookings.filter((b) => b.status === 'active') : [];
  const worth = (b: ShareBooking) => b.shares * D!.offerings[b.offering].pricePerShare;
  const out = (
    <button className="btn ghost sm" onClick={logout}>Log out</button>
  );

  if (!ready) return <Shell admin><div /></Shell>;

  return (
    <Shell admin action={token ? out : <span />}>
      {!token ? (
        <div className="login">
          <div className="card gold">
            <div className="card-h">Admin login</div>
            <div className="card-b">
              <form onSubmit={signIn}>
                <div className={`msg err${loginErr ? ' show' : ''}`} role="alert">{loginErr}</div>
                <div className="field">
                  <label htmlFor="as-adm-email">Email</label>
                  <input id="as-adm-email" type="email" autoComplete="username" inputMode="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="as-adm-pw">Password</label>
                  <input id="as-adm-pw" type="password" autoComplete="current-password" required
                    value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
                <button className="btn navy" type="submit">Log in</button>
              </form>
            </div>
          </div>
        </div>
      ) : D && (
        <div>
          <div className="head">
            <div>
              <div className="eyebrow">Admin · Share offerings</div>
              <h1>Share bookings</h1>
            </div>
            <div className="row">
              {OFFERINGS.map((o) => (
                <a key={o} className="btn ghost sm" href={o === 'aladino' ? '/aladino-shares' : '/real-estate-shares'} target="_blank" rel="noopener">
                  {OFFERING_LABEL[o]} page ↗
                </a>
              ))}
              <button className="btn ghost sm" onClick={() => token && shareCsv(token).catch((e) => flash(e.message, false))}>Export CSV</button>
            </div>
          </div>
          <div className={`msg${msg ? ' show ' + (msg.ok ? 'ok' : 'err') : ''}`} role="status">{msg?.t}</div>

          <div className="filters" style={{ marginBottom: 16 }} role="tablist" aria-label="Offering">
            {([['all', 'All pages'], ['aladino', 'Aladino'], ['real-estate', 'Real estate']] as [Scope, string][]).map(([k, label]) => (
              <button key={k} className={scope === k ? 'on' : ''} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}>{label}</button>
            ))}
          </div>

          {S ? (
            <div className="stats" style={{ margin: '0 0 24px' }}>
              <div className="stat g"><small>Available</small><b>{S.availableShares} / {S.totalShares}</b></div>
              <div className="stat"><small>Booked shares</small><b>{S.bookedShares}</b></div>
              <div className="stat"><small>Booked value</small><b>{eur(S.bookedShares * S.pricePerShare)}</b></div>
              <div className="stat"><small>Booked stake</small><b>{pct((S.bookedShares * S.pricePerShare / S.valuation) * 100)}</b></div>
            </div>
          ) : (
            <div className="stats" style={{ margin: '0 0 24px' }}>
              {OFFERINGS.map((o, i) => (
                <div key={o} className={`stat${i === 0 ? ' g' : ''}`}><small>{OFFERING_LABEL[o]} available</small>
                  <b>{D.offerings[o].availableShares} / {D.offerings[o].totalShares}</b></div>
              ))}
              <div className="stat"><small>Active requests</small><b>{live.length}</b></div>
              <div className="stat"><small>Booked value (all)</small><b>{eur(live.reduce((n, b) => n + worth(b), 0))}</b></div>
            </div>
          )}

          {S ? (
            <div className="ctrl">
              <div className="card"><div className="card-b switch">
                <div>
                  <h2 style={{ fontSize: 17 }}>Public page <span className={`pill ${S.visible ? 'on' : 'off'}`}>{S.visible ? 'Visible' : 'Hidden'}</span></h2>
                  <p>When hidden, visitors see “Booking is currently closed” and no new bookings are accepted.</p>
                </div>
                <label className="tog" aria-label="Public page visible">
                  <input type="checkbox" checked={!!S.visible}
                    onChange={(e) => setting({ offering: scope, visible: e.target.checked }, e.target.checked ? 'Public page is now visible.' : 'Public page hidden — bookings closed.')} />
                  <span />
                </label>
              </div></div>
              <div className="card"><div className="card-b switch">
                <div>
                  <h2 style={{ fontSize: 17 }}>Member booking lookup <span className={`pill ${S.allowLookup ? 'on' : 'off'}`}>{S.allowLookup ? 'On' : 'Off'}</span></h2>
                  <p>When on, members can enter their email on the public page to see only their own bookings.</p>
                </div>
                <label className="tog" aria-label="Member booking lookup">
                  <input type="checkbox" checked={S.allowLookup}
                    onChange={(e) => setting({ offering: scope, allowLookup: e.target.checked }, e.target.checked ? 'Members can now look up their bookings.' : 'Member lookup turned off.')} />
                  <span />
                </label>
              </div></div>
              <div className="card"><div className="card-b">
                <h2 style={{ fontSize: 17, marginBottom: 4 }}>Total shares offered</h2>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 10 }}>Available = total − booked. Can&apos;t go below booked shares.</p>
                <form className="tot" onSubmit={(e) => { e.preventDefault(); setting({ offering: scope, totalShares: parseInt(totalIn, 10) }, 'Total shares updated.'); }}>
                  <input type="number" inputMode="numeric" min={0} step={1} value={totalIn}
                    onFocus={() => { totalFocus.current = true; }} onBlur={() => { totalFocus.current = false; }}
                    onChange={(e) => setTotalIn(e.target.value)} />
                  <button className="btn navy sm" style={{ height: 50 }} type="submit">Save</button>
                </form>
              </div></div>
            </div>
          ) : (
            <p className="hint" style={{ margin: '-8px 0 24px' }}>Pick Aladino or Real estate above to change that page&apos;s settings.</p>
          )}

          <div className="card">
            <div className="card-h">
              <span>Requests <span style={{ opacity: 0.7, fontWeight: 400 }}>· {list.length}</span></span>
              <div className="filters">
                {([['active', 'Active'], ['cancelled', 'Undone'], ['all', 'All']] as [Filter, string][]).map(([f, label]) => (
                  <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="card-b" style={{ paddingTop: 8 }}>
              <table>
                <thead><tr><th>Date</th><th>Source</th><th>Name</th><th>Email</th><th>Shares</th><th>Value</th><th>Stake</th><th className="act" /></tr></thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr><td colSpan={8} className="empty">No requests yet.</td></tr>
                  ) : list.map((b) => (
                    <tr key={b.id} className={b.status === 'cancelled' ? 'cx' : ''}>
                      <td data-l="Date">{fmtDate(b.createdAt)}</td>
                      <td data-l="Source"><span className={`src ${b.offering}`}>{OFFERING_LABEL[b.offering]}</span></td>
                      <td data-l="Name">{b.name}</td>
                      <td data-l="Email" className="em">{b.email}</td>
                      <td data-l="Shares" className="n">{b.shares}</td>
                      <td data-l="Value" className="n">{eur(worth(b))}</td>
                      <td data-l="Stake" className="n">{pct((worth(b) / D.offerings[b.offering].valuation) * 100)}</td>
                      <td className="act">
                        {b.status === 'active' ? (
                          <button className="btn sm red" onClick={() => act(b, 'cancel', `Undo ${b.name}'s booking of ${b.shares} shares? They go back to available.`)}>Undo</button>
                        ) : (
                          <>
                            <button className="btn sm ghost" onClick={() => act(b, 'restore')}>Restore</button>
                            <button className="btn sm red" onClick={() => act(b, 'delete', `Permanently delete ${b.name}'s undone request? This can't be reversed.`)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
