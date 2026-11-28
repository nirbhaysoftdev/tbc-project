'use client';
// The public Aladino Shares page: live availability, a booking form, and an
// optional "check my booking" lookup by email. No login and no member record -
// a booking is just a name, an email and a number of shares.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Shell, Lang } from './Chrome';
import {
  DEFAULT_STATES, EMAIL_RE, Offering, ShareApiError, ShareState, eur, eurShort, fmtDate, pct, shareFetch,
} from '@/lib/aladinoShares';

const T = {
  en: {
    nameErr: 'Please enter your full name.', emailErr: 'Please enter a valid email.', minErr: 'Please enter at least 1 share.',
    onlyLeft: (n: number) => `Only ${n} shares are still available.`,
    closedEyebrow: 'Members offering', closedTitle: 'Booking is currently closed',
    closedText: 'This offering is not open right now. Please check back soon or contact the TBC team.',
    eyebrow: 'Exclusive members offer', h1a: 'Own limited ', h1b: 'Aladino shares', lead: 'A once-only allocation for TBC members. First come, first served — reserve your shares below.',
    availNow: 'Shares available now', live: 'Live', fcfs: 'First come · first served', reserveBefore: 'Reserve before they are gone',
    valuation: 'Valuation', pricePer: 'Price / share', oneShare: '1 share =', totalOffer: 'Total offer',
    book: 'Book your shares', reserved: 'Shares reserved', thanks: (n: string) => `Thank you, ${n}. Your booking is recorded.`,
    shares: 'Shares', totalValue: 'Total value', stakeOf: (v: string) => `Stake of ${v} valuation`, another: 'Make another booking',
    fullName: 'Full name', namePh: 'e.g. Maria Rossi', email: 'Email', numShares: 'Number of shares', fewer: 'Fewer shares', more: 'More shares',
    only: 'Only ', max: 'Max ', avail: ' shares available', yourStake: 'Your stake', ofAladino: (v: string) => `of Aladino Family at ${v} valuation`,
    booking: 'Booking…', soldOut: 'All shares booked', bookBtn: 'Book shares',
    fine: 'Booking is a reservation. The TBC team will contact you by email to confirm and complete.',
    checkTitle: 'Check my booking', bookedWith: 'Email you booked with', check: 'Check', none: '{t.none}',
    cancelled: ' · cancelled', sharesWord: 'shares', totalActive: 'Total active', yourStakeOf: (v: string) => `Your stake of ${v}`,
    p1a: 'Only ', p1b: ' shares', p1c: ' — no further share sale is planned',
    p2a: '€5,000 per share', p2b: ' · investment capital secured by Zurich',
    p3a: 'First come, first served', p3b: ' — allocated in order of reservation',
    p4a: 'After 6 months: exit with a ', p4b: 'minimum 10% guaranteed by TBC', p4c: ', or stay',
    perShare: ' per share', noteK: 'After this meeting', noteA: 'Any shares left will be offered to other community members after 7 days — ', noteB: 'not guaranteed', noteC: ', they may all be taken today.',
  },
  it: {
    nameErr: 'Inserisci il tuo nome completo.', emailErr: 'Inserisci un indirizzo email valido.', minErr: 'Inserisci almeno 1 quota.',
    onlyLeft: (n: number) => `Sono ancora disponibili solo ${n} quote.`,
    closedEyebrow: 'Offerta ai soci', closedTitle: 'Le prenotazioni sono al momento chiuse',
    closedText: 'Questa offerta non è aperta in questo momento. Riprova a breve o contatta il team TBC.',
    eyebrow: 'Offerta esclusiva per i soci', h1a: 'Possiedi quote limitate di ', h1b: 'Aladino', lead: 'Un’assegnazione unica per i membri TBC. Chi prima arriva, meglio alloggia — prenota le tue quote qui sotto.',
    availNow: 'Quote disponibili ora', live: 'In diretta', fcfs: 'Chi prima arriva · meglio alloggia', reserveBefore: 'Prenota prima che finiscano',
    valuation: 'Valutazione', pricePer: 'Prezzo / quota', oneShare: '1 quota =', totalOffer: 'Offerta totale',
    book: 'Prenota le tue quote', reserved: 'Quote prenotate', thanks: (n: string) => `Grazie, ${n}. La tua prenotazione è stata registrata.`,
    shares: 'Quote', totalValue: 'Valore totale', stakeOf: (v: string) => `Partecipazione su valutazione di ${v}`, another: 'Effettua un’altra prenotazione',
    fullName: 'Nome completo', namePh: 'es. Maria Rossi', email: 'Email', numShares: 'Numero di quote', fewer: 'Meno quote', more: 'Più quote',
    only: 'Solo ', max: 'Max ', avail: ' quote disponibili', yourStake: 'La tua partecipazione', ofAladino: (v: string) => `di Aladino Family con valutazione di ${v}`,
    booking: 'Prenotazione…', soldOut: 'Tutte le quote sono prenotate', bookBtn: 'Prenota quote',
    fine: 'La prenotazione è una riserva. Il team TBC ti contatterà via email per confermare e completare.',
    checkTitle: 'Verifica la mia prenotazione', bookedWith: 'Email usata per la prenotazione', check: 'Verifica', none: 'Nessuna prenotazione trovata per questa email.',
    cancelled: ' · annullata', sharesWord: 'quote', totalActive: 'Totale attivo', yourStakeOf: (v: string) => `La tua partecipazione su ${v}`,
    p1a: 'Solo ', p1b: ' quote', p1c: ' — non è prevista alcuna ulteriore vendita',
    p2a: '€5.000 per quota', p2b: ' · capitale d’investimento garantito da Zurich',
    p3a: 'Chi prima arriva, meglio alloggia', p3b: ' — assegnazione in ordine di prenotazione',
    p4a: 'Dopo 6 mesi: esci con un ', p4b: 'minimo del 10% garantito da TBC', p4c: ', oppure resta',
    perShare: ' per quota', noteK: 'Dopo questo incontro', noteA: 'Le quote rimanenti saranno offerte ad altri membri della community dopo 7 giorni — ', noteB: 'non è garantito', noteC: ', potrebbero essere tutte assegnate oggi.',
  },
};

interface Receipt { name: string; shares: number; value: number; pct: number }
interface MyBooking { shares: number; amount: number; createdAt: string; status: 'active' | 'cancelled' }

// What differs between the pages. Everything else is shared.
const COPY = {
  aladino: {
    en: {
      h1a: 'Own limited ', h1em: 'Aladino shares', lead: 'A once-only allocation for TBC members. First come, first served — reserve your shares below.',
      ofX: (v: string) => `of Aladino Family at ${v} valuation`,
    },
    it: {
      h1a: 'Possiedi quote limitate di ', h1em: 'Aladino', lead: 'Un’assegnazione unica per i membri TBC. Chi prima arriva, meglio alloggia — prenota le tue quote qui sotto.',
      ofX: (v: string) => `di Aladino Family con valutazione di ${v}`,
    },
  },
  'real-estate': {
    en: {
      h1a: 'Own limited ', h1em: 'Real estate shares', lead: 'A once-only allocation for TBC members in Mercedes-Benz Places · Binghatti City. First come, first served — reserve your shares below.',
      ofX: (v: string) => `of Mercedes-Benz Places · Binghatti City at ${v} valuation`,
    },
    it: {
      h1a: 'Possiedi quote ', h1em: 'immobiliari', lead: 'Un’assegnazione unica per i membri TBC in Mercedes-Benz Places · Binghatti City. Chi prima arriva, meglio alloggia — prenota le tue quote qui sotto.',
      ofX: (v: string) => `di Mercedes-Benz Places · Binghatti City con valutazione di ${v}`,
    },
  },
};

export default function SharesPage({ offering = 'aladino' }: { offering?: Offering }) {
  const [lang, setLangState] = useState<Lang>('en');
  const t = { ...T[lang], ...COPY[offering][lang] };
  useEffect(() => {
    try { if (localStorage.getItem('as-lang') === 'it') setLangState('it'); } catch { /* storage blocked */ }
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('as-lang', l); } catch { /* storage blocked */ }
  };

  const [S, setS] = useState<ShareState>(DEFAULT_STATES[offering]);
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
      const d = await shareFetch<ShareState>(`/state?offering=${offering}`);
      setS((prev) => ({ ...prev, ...d }));
      setLoaded(true);
    } catch { /* keep what is on screen */ }
  }, [offering]);

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
    if (nm.length < 2) return setFormErr(t.nameErr);
    if (!EMAIL_RE.test(em)) return setFormErr(t.emailErr);
    if (!sh || sh < 1) return setFormErr(t.minErr);
    if (sh > S.availableShares) return setFormErr(t.onlyLeft(S.availableShares));
    setBusy(true);
    try {
      const d = await shareFetch<{ state: ShareState }>('/book', { body: { offering, name: nm, email: em, shares: sh } });
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
    if (!EMAIL_RE.test(em)) return setLookupErr(t.emailErr);
    try {
      const d = await shareFetch<{ bookings: MyBooking[] }>('/my-bookings', { body: { offering, email: em } });
      setMine(d.bookings);
    } catch (err) { setLookupErr((err as Error).message); }
  };

  const active = (mine || []).filter((b) => b.status === 'active');
  const myShares = active.reduce((s, b) => s + b.shares, 0);

  return (
    <Shell offering={offering} lang={lang} onLang={setLang}>
      {closed ? (
        <div className="closed">
          <div className="card gold"><div className="card-b">
            <div className="eyebrow gold">{t.closedEyebrow}</div>
            <h2>{t.closedTitle}</h2>
            <p>{t.closedText}</p>
          </div></div>
        </div>
      ) : (
        <div className="layout">
          <section id="intro">
            <div className="rule" />
            {offering === 'aladino' && (
              <img className="hero-logo" src="/images/aladino-lamp-logo.webp" alt="Aladino" width={220} height={123} />
            )}
            <div className="eyebrow">{t.eyebrow}</div>
            <h1 style={{ margin: '10px 0 12px' }}>{t.h1a}<em>{t.h1em}</em>.</h1>
            <p className="lead">{t.lead}</p>

            <figure className={`hero-img ${offering}`}>
              {offering === 'aladino' ? (
                <img src="/images/aladino-shares-robot.webp" alt="Aladino retail assistant robot in a supermarket" width={1000} height={1000} />
              ) : (
                <img src="/images/real-estate-mercedes-places.webp" alt="Mercedes-Benz Places · Binghatti City" width={1200} height={950} />
              )}
            </figure>

            <div className="card gold" style={{ marginTop: 24 }}>
              <div className="card-h">{t.availNow} <span className="live">{t.live}</span></div>
              <div className="card-b">
                <div className="big">
                  <strong className={loaded ? '' : 'skel'}>{S.availableShares.toLocaleString('en-US')}</strong>
                  <span>/ {S.totalShares.toLocaleString('en-US')}</span>
                </div>
                <div className="bar"><div style={{ width: (S.totalShares ? (S.availableShares / S.totalShares) * 100 : 0) + '%' }} /></div>
                <div className="bar-l"><span>{t.fcfs}</span><span>{t.reserveBefore}</span></div>
              </div>
            </div>

            <div className="stats">
              <div className="stat g"><small>{t.valuation}</small><b>{eurShort(S.valuation)}</b></div>
              <div className="stat"><small>{t.pricePer}</small><b>{eur(S.pricePerShare)}</b></div>
              <div className="stat"><small>{t.oneShare}</small><b>{pct((S.pricePerShare / S.valuation) * 100)}</b></div>
              <div className="stat"><small>{t.totalOffer}</small><b>{eurShort(S.totalShares * S.pricePerShare)}</b></div>
            </div>
          </section>

          <section id="formCol">
            <div className="card">
              <div className="card-h">{t.book}</div>
              <div className="card-b">
                {receipt ? (
                  <div className="success">
                    <div className="tick">✓</div>
                    <h2>{t.reserved}</h2>
                    <p>{t.thanks(receipt.name)}</p>
                    <div className="receipt">
                      <div><span>{t.shares}</span><b>{receipt.shares}</b></div>
                      <div><span>{t.totalValue}</span><b>{eur(receipt.value)}</b></div>
                      <div><span>{t.stakeOf(eurShort(S.valuation))}</span><b>{pct(receipt.pct)}</b></div>
                    </div>
                    <button className="btn ghost" type="button" onClick={again}>{t.another}</button>
                  </div>
                ) : (
                  <form onSubmit={submit} noValidate>
                    <div className={`msg err${formErr ? ' show' : ''}`} role="alert">{formErr}</div>
                    <div className="field">
                      <label htmlFor="as-name">{t.fullName} <span className="req" aria-hidden="true">*</span></label>
                      <input id="as-name" type="text" autoComplete="name" placeholder={t.namePh} required maxLength={120}
                        value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="as-email">{t.email} <span className="req" aria-hidden="true">*</span></label>
                      <input id="as-email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required maxLength={160}
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="as-shares">{t.numShares} <span className="req" aria-hidden="true">*</span></label>
                      <div className="stepper">
                        <button type="button" aria-label={t.fewer} onClick={() => step(-1)}>−</button>
                        <input id="as-shares" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required
                          value={shares} onChange={(e) => onShares(e.target.value)} onBlur={() => { if (!shares) setShares('1'); }} />
                        <button type="button" aria-label={t.more} onClick={() => step(1)}>+</button>
                      </div>
                      <div className="hint" style={over ? { color: 'var(--err)' } : undefined}>
                        {over ? t.only : t.max}{S.availableShares}{t.avail}
                      </div>
                    </div>

                    <div className="summary" aria-live="polite">
                      <div><small>{t.totalValue}</small><b className="val">{eur(value)}</b></div>
                      <div><small>{t.yourStake}</small><b>{pct((value / S.valuation) * 100)}</b></div>
                      <div className="full">{t.ofX(eur(S.valuation))}</div>
                    </div>

                    <button className="btn" type="submit" disabled={busy || soldOut}>
                      {busy ? t.booking : soldOut ? t.soldOut : t.bookBtn}
                    </button>
                    <p className="fine">{t.fine}</p>
                  </form>
                )}
              </div>
            </div>

            {S.allowLookup && (
              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-h">{t.checkTitle}</div>
                <div className="card-b">
                  <form onSubmit={lookup} noValidate>
                    <div className={`msg err${lookupErr ? ' show' : ''}`} role="alert">{lookupErr}</div>
                    <label htmlFor="as-lookup">{t.bookedWith}</label>
                    <div className="stepper">
                      <input id="as-lookup" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" maxLength={160}
                        style={{ textAlign: 'left', fontWeight: 400, fontSize: 16, color: 'var(--ink)' }}
                        value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} />
                      <button className="btn navy lookup-btn" type="submit">{t.check}</button>
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
                                <span>{fmtDate(b.createdAt)}{cx ? t.cancelled : ''}</span>
                                <b style={cx ? { color: '#9aa5b8', textDecoration: 'line-through' } : undefined}>
                                  {b.shares} {t.sharesWord} · {eur(b.amount)}
                                </b>
                              </div>
                            );
                          })}
                          <div style={{ borderTop: '1px solid var(--line)', marginTop: 6 }} />
                          <div><span>{t.totalActive}</span><b>{myShares} {t.sharesWord} · {eur(myShares * S.pricePerShare)}</b></div>
                          <div><span>{t.yourStakeOf(eur(S.valuation))}</span><b>{pct((myShares * S.pricePerShare / S.valuation) * 100)}</b></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section id="details">
            {offering === 'aladino' ? (
              <>
                <ul className="points">
                  <li>{t.p1a}<b>{S.totalShares}{t.p1b}</b>{t.p1c}</li>
                  <li><b>{t.p2a}</b>{t.p2b}</li>
                  <li><b>{t.p3a}</b>{t.p3b}</li>
                  <li>{t.p4a}<b>{t.p4b}</b>{t.p4c}</li>
                </ul>
                <div className="note"><b className="k">{t.noteK}</b>{t.noteA}<b>{t.noteB}</b>{t.noteC}</div>
              </>
            ) : (
              <ul className="points">
                <li>{t.p1a}<b>{S.totalShares}{t.p1b}</b></li>
                <li><b>{eur(S.pricePerShare)}{t.perShare}</b></li>
                <li><b>{t.p3a}</b>{t.p3b}</li>
              </ul>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
