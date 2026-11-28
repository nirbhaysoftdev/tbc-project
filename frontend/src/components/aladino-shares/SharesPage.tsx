'use client';
// The public Aladino Shares page: live availability, a booking form, and an
// optional "check my booking" lookup by email. No login and no member record -
// a booking is just a name, an email and a number of shares.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Shell } from './Chrome';
import {
  DEFAULT_STATE, EMAIL_RE, ShareApiError, ShareState, eur, eurShort, fmtDate, pct, shareFetch,
} from '@/lib/aladinoShares';

interface Receipt { name: string; shares: number; value: number; pct: number }
interface MyBooking { shares: number; amount: number; createdAt: string; status: 'active' | 'cancelled' }

export default function SharesPage() {
  const [S, setS] = useState<ShareState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [shares, setShares] = useState('1');
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupErr, setLookupErr] = useState('');
  const [mine, setMine] = useState<MyBooking[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await shareFetch<ShareState>('/state');
      setS((prev) => ({ ...prev, ...d }));
      setLoaded(true);
    } catch { /* keep what is on screen */ }
  }, []);

  useEffect(() => {
    refresh();
    const tick = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    const vis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', vis); };
  }, [refresh]);

  const n = Math.max(0, parseInt(shares, 10) || 0);
  const value = n * S.pricePerShare;
  const over = n > S.availableShares;
  const soldOut = S.availableShares === 0;
  const closed = S.visible === false;

  // Digits only, and never above what is still available: a typed 9999 becomes
  // the maximum instead of an error after submitting. Empty is allowed while
  // typing and goes back to 1 on blur.
  const onShares = (raw: string) => {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return setShares('');
    setShares(String(Math.min(parseInt(digits, 10), Math.max(1, S.availableShares))));
  };

  const step = (d: number) => {
    const v = Math.max(1, (parseInt(shares, 10) || 0) + d);
    setShares(String(Math.min(v, Math.max(1, S.availableShares))));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr('');
    const nm = name.trim();
    const em = email.trim();
    const sh = parseInt(shares, 10);
    if (nm.length < 2) return setFormErr('Please enter your full name.');
    if (!EMAIL_RE.test(em)) return setFormErr('Please enter a valid email.');
    if (!sh || sh < 1) return setFormErr('Please enter at least 1 share.');
    if (sh > S.availableShares) return setFormErr(`Only ${S.availableShares} shares are still available.`);
    setBusy(true);
    try {
      const d = await shareFetch<{ state: ShareState }>('/book', { body: { name: nm, email: em, shares: sh } });
      setS((p) => ({ ...p, ...d.state }));
      setReceipt({ name: nm, shares: sh, value: sh * S.pricePerShare, pct: (sh * S.pricePerShare / S.valuation) * 100 });
    } catch (err) {
      const ex = err as ShareApiError;
      if (ex.data?.state) setS((p) => ({ ...p, ...ex.data.state }));
      setFormErr(ex.message);
    } finally { setBusy(false); }
  };

  const again = () => { setName(''); setEmail(''); setShares('1'); setReceipt(null); };

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupErr(''); setMine(null);
    const em = lookupEmail.trim();
    if (!EMAIL_RE.test(em)) return setLookupErr('Please enter a valid email.');
    try {
      const d = await shareFetch<{ bookings: MyBooking[] }>('/my-bookings', { body: { email: em } });
      setMine(d.bookings);
    } catch (err) { setLookupErr((err as Error).message); }
  };

  const active = (mine || []).filter((b) => b.status === 'active');
  const myShares = active.reduce((s, b) => s + b.shares, 0);

  return (
    <Shell>
      {closed ? (
        <div className="closed">
          <div className="card gold"><div className="card-b">
            <div className="eyebrow gold">Members offering</div>
            <h2>Booking is currently closed</h2>
            <p>This offering is not open right now. Please check back soon or contact the TBC team.</p>
          </div></div>
        </div>
      ) : (
        <div className="layout">
          <section id="intro">
            <div className="rule" />
            <div className="eyebrow">Exclusive members offer</div>
            <h1 style={{ margin: '10px 0 12px' }}>Own limited <em>Aladino shares</em>.</h1>
            <p className="lead">A once-only allocation for TBC members. First come, first served — reserve your shares below.</p>

            <div className="card gold" style={{ marginTop: 24 }}>
              <div className="card-h">Shares available now <span className="live">Live</span></div>
              <div className="card-b">
                <div className="big">
                  <strong className={loaded ? '' : 'skel'}>{S.availableShares.toLocaleString('en-US')}</strong>
                  <span>/ {S.totalShares.toLocaleString('en-US')}</span>
                </div>
                <div className="bar"><div style={{ width: (S.totalShares ? (S.availableShares / S.totalShares) * 100 : 0) + '%' }} /></div>
                <div className="bar-l"><span>First come · first served</span><span>Reserve before they are gone</span></div>
              </div>
            </div>

            <div className="stats">
              <div className="stat g"><small>Valuation</small><b>{eurShort(S.valuation)}</b></div>
              <div className="stat"><small>Price / share</small><b>{eur(S.pricePerShare)}</b></div>
              <div className="stat"><small>1 share =</small><b>{pct((S.pricePerShare / S.valuation) * 100)}</b></div>
              <div className="stat"><small>Total offer</small><b>{eurShort(S.totalShares * S.pricePerShare)}</b></div>
            </div>
          </section>

          <section id="formCol">
            <div className="card">
              <div className="card-h">Book your shares</div>
              <div className="card-b">
                {receipt ? (
                  <div className="success">
                    <div className="tick">✓</div>
                    <h2>Shares reserved</h2>
                    <p>Thank you, {receipt.name}. Your booking is recorded.</p>
                    <div className="receipt">
                      <div><span>Shares</span><b>{receipt.shares}</b></div>
                      <div><span>Total value</span><b>{eur(receipt.value)}</b></div>
                      <div><span>Stake of {eurShort(S.valuation)} valuation</span><b>{pct(receipt.pct)}</b></div>
                    </div>
                    <button className="btn ghost" type="button" onClick={again}>Make another booking</button>
                  </div>
                ) : (
                  <form onSubmit={submit} noValidate>
                    <div className={`msg err${formErr ? ' show' : ''}`} role="alert">{formErr}</div>
                    <div className="field">
                      <label htmlFor="as-name">Full name <span className="req" aria-hidden="true">*</span></label>
                      <input id="as-name" type="text" autoComplete="name" placeholder="e.g. Maria Rossi" required maxLength={120}
                        value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="as-email">Email <span className="req" aria-hidden="true">*</span></label>
                      <input id="as-email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required maxLength={160}
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="as-shares">Number of shares <span className="req" aria-hidden="true">*</span></label>
                      <div className="stepper">
                        <button type="button" aria-label="Fewer shares" onClick={() => step(-1)}>−</button>
                        <input id="as-shares" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required
                          value={shares} onChange={(e) => onShares(e.target.value)} onBlur={() => { if (!shares) setShares('1'); }} />
                        <button type="button" aria-label="More shares" onClick={() => step(1)}>+</button>
                      </div>
                      <div className="hint" style={over ? { color: 'var(--err)' } : undefined}>
                        {over ? 'Only ' : 'Max '}{S.availableShares} shares available
                      </div>
                    </div>

                    <div className="summary" aria-live="polite">
                      <div><small>Total value</small><b className="val">{eur(value)}</b></div>
                      <div><small>Your stake</small><b>{pct((value / S.valuation) * 100)}</b></div>
                      <div className="full">of Aladino Family at {eur(S.valuation)} valuation</div>
                    </div>

                    <button className="btn" type="submit" disabled={busy || soldOut}>
                      {busy ? 'Booking…' : soldOut ? 'All shares booked' : 'Book shares'}
                    </button>
                    <p className="fine">Booking is a reservation. The TBC team will contact you by email to confirm and complete.</p>
                  </form>
                )}
              </div>
            </div>

            {S.allowLookup && (
              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-h">Check my booking</div>
                <div className="card-b">
                  <form onSubmit={lookup} noValidate>
                    <div className={`msg err${lookupErr ? ' show' : ''}`} role="alert">{lookupErr}</div>
                    <label htmlFor="as-lookup">Email you booked with</label>
                    <div className="stepper">
                      <input id="as-lookup" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" maxLength={160}
                        style={{ textAlign: 'left', fontWeight: 400, fontSize: 16, color: 'var(--ink)' }}
                        value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} />
                      <button className="btn navy lookup-btn" type="submit">Check</button>
                    </div>
                  </form>
                  {mine && (
                    <div style={{ marginTop: 14 }}>
                      {mine.length === 0 ? (
                        <p className="hint" style={{ fontSize: 14 }}>No bookings found for this email.</p>
                      ) : (
                        <div className="receipt" style={{ margin: 0 }}>
                          {mine.map((b, i) => {
                            const cx = b.status === 'cancelled';
                            const muted = cx ? { color: '#9aa5b8' } : undefined;
                            return (
                              <div key={i} style={muted}>
                                <span>{fmtDate(b.createdAt)}{cx ? ' · cancelled' : ''}</span>
                                <b style={cx ? { color: '#9aa5b8', textDecoration: 'line-through' } : undefined}>
                                  {b.shares} shares · {eur(b.amount)}
                                </b>
                              </div>
                            );
                          })}
                          <div style={{ borderTop: '1px solid var(--line)', marginTop: 6 }} />
                          <div><span>Total active</span><b>{myShares} shares · {eur(myShares * S.pricePerShare)}</b></div>
                          <div><span>Your stake of {eur(S.valuation)}</span><b>{pct((myShares * S.pricePerShare / S.valuation) * 100)}</b></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section id="details">
            <ul className="points">
              <li><b>Only {S.totalShares} shares</b> — no further share sale is planned</li>
              <li><b>€5,000 per share</b> · investment capital secured by Zurich</li>
              <li><b>First come, first served</b> — allocated in order of reservation</li>
              <li>After 6 months: exit with a <b>minimum 10% guaranteed by TBC</b>, or stay</li>
            </ul>
            <div className="note"><b className="k">After this meeting</b>Any shares left will be offered to other community members after 7 days — <b>not guaranteed</b>, they may all be taken today.</div>
          </section>
        </div>
      )}
    </Shell>
  );
}
