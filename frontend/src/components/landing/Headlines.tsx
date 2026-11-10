'use client';
// src/components/landing/Headlines.tsx - the landing page's business briefing
//
//   ┌ LIVE MARKETS ▸ running ticker of index / FX / gold quotes ┐
//   ├ Top story (image) ┬ three more stories ┬ Market Snapshot   ┤
//   │                   │                    │ Member briefing   │
//
// Stories are the publishers' own headlines, snippets and images, refreshed on
// the server every 40 minutes. The cards are display-only: nothing here links
// out, and the API does not send the publisher link. Reading the full story is
// for signed-in members (the portal's /news page). Market
// figures come from the server's last good fetch. NOTHING on this page is
// invented: when a number is unavailable its slot is left out, and when there
// are no stories the whole section disappears rather than show an empty shell.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { newsAPI } from '@/lib/api';
import { timeAgo } from '@/lib/timeAgo';

interface Story {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  imageUrl: string | null;
  category: string;
  publishedAt: string;
}

interface Quote {
  key: string;
  label: string;
  price: number;
  changePct: number | null;
  decimals: number;
  currency: string | null;
}

const fmt = (q: Quote) =>
  `${q.currency === 'USD' ? '$' : ''}${q.price.toLocaleString('en-US', {
    minimumFractionDigits: q.decimals,
    maximumFractionDigits: q.decimals,
  })}`;

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={`lp-mk-chg ${up ? 'lp-mk-up' : 'lp-mk-down'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {up ? '+' : '−'}{Math.abs(pct).toFixed(2)}%
    </span>
  );
}

const Icon = {
  radio: 'M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M12 12h.01M3 12a9 9 0 0118 0',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z',
  bars: 'M5 20V12M12 20V4M19 20v-6',
  brent: 'M12 3s6 6 6 11a6 6 0 11-12 0c0-5 6-11 6-11z',
  gold: 'M3 18h18l-2-6H5l-2 6zM8 12l1-4h6l1 4',
  usd: 'M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3',
  btc: 'M9 4v16M9 6h5a3 3 0 010 6H9m0 0h6a3 3 0 010 6H9M11 3v3M11 18v3',
} as const;

function Svg({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** An image that quietly gives way to a tinted tile if the publisher's CDN refuses it. */
function Pic({ src, className }: { src: string | null; className: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={`${className} lp-st-noimg`} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />
  );
}

const SNAPSHOT: { key: string; icon: string }[] = [
  { key: 'brent', icon: Icon.brent },
  { key: 'gold', icon: Icon.gold },
  { key: 'usd', icon: Icon.usd },
  { key: 'btc', icon: Icon.btc },
];
const TICKER = ['sp500', 'nasdaq', 'ftse', 'dax', 'gold', 'eurusd'];

export default function Headlines() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    let alive = true;
    const loadStories = () =>
      newsAPI.headlines(12)
        .then((r) => { if (alive) setStories(r.data?.headlines ?? []); })
        // A failed re-check keeps what is on screen; only the first load may
        // fall back to empty, which hides the section.
        .catch(() => { if (alive) setStories((cur) => cur ?? []); });
    const loadMarkets = () =>
      newsAPI.markets()
        .then((r) => { if (alive) setQuotes(r.data?.quotes ?? []); })
        .catch(() => {});
    loadStories();
    loadMarkets();
    // The server refreshes stories every 40 minutes and markets every 10; a page
    // left open picks both up without a reload.
    const a = setInterval(loadStories, 10 * 60 * 1000);
    const b = setInterval(loadMarkets, 2 * 60 * 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);

  // The feature wants a picture: take the newest story that has one, else the
  // newest. The rest keep their order, newest first.
  const { feature, side } = useMemo(() => {
    const list = stories ?? [];
    const f = list.find((s) => s.imageUrl) ?? list[0];
    return { feature: f, side: list.filter((s) => s !== f).slice(0, 3) };
  }, [stories]);

  const byKey = useMemo(() => new Map(quotes.map((q) => [q.key, q])), [quotes]);
  const ticker = TICKER.map((k) => byKey.get(k)).filter(Boolean) as Quote[];
  const snapshot = SNAPSHOT.map((s) => ({ ...s, q: byKey.get(s.key) })).filter((s) => s.q) as { key: string; icon: string; q: Quote }[];

  if (!feature) return null;

  return (
    <section className="lp-section lp-mk" id="news" aria-label="Business news and markets">
      {ticker.length > 0 && (
        <div className="lp-mk-bar">
          <span className="lp-mk-live"><Svg d={Icon.radio} size={15} /> LIVE MARKETS</span>
          <div className="lp-mk-run" role="region" aria-label="Market quotes">
            <div className="lp-mk-track">
              {[0, 1].map((copy) => (
                <ul className="lp-mk-set" key={copy} aria-hidden={copy === 1 || undefined}>
                  {ticker.map((q) => (
                    <li key={q.key}>
                      <span className="lp-mk-name">{q.label}</span>
                      <span className="lp-mk-px">{fmt(q)}</span>
                      <Change pct={q.changePct} />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="lp-st-grid">
        <article className="lp-st-feature">
          <Pic src={feature.imageUrl} className="lp-st-fimg" />
          <div className="lp-st-fbody">
            <span className="lp-st-badge">TOP STORY</span>
            <h2 className="lp-st-ftitle">{feature.title}</h2>
            {feature.summary && <p className="lp-st-fsum">{feature.summary}</p>}
            <div className="lp-st-ffoot">
              <span className="lp-st-meta"><Svg d={Icon.clock} size={15} /> {feature.category} <i>•</i> {timeAgo(feature.publishedAt)} <i>•</i> {feature.source}</span>
              <span className="lp-st-read"><Svg d={Icon.lock} size={14} /> Members only</span>
            </div>
          </div>
        </article>

        <div className="lp-st-list">
          {side.map((s) => (
            <article key={s.id} className="lp-st-item">
              <Pic src={s.imageUrl} className="lp-st-thumb" />
              <div className="lp-st-ibody">
                <span className="lp-st-cat">{s.category}</span>
                <h3 className="lp-st-ititle">{s.title}</h3>
                <span className="lp-st-meta"><Svg d={Icon.clock} size={14} /> {timeAgo(s.publishedAt)} <i>•</i> {s.source}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className="lp-st-side">
          {snapshot.length > 0 && (
            <div className="lp-st-card">
              <h3 className="lp-st-ctitle"><Svg d={Icon.bars} size={22} /> Market Snapshot</h3>
              <ul className="lp-snap">
                {snapshot.map(({ key, icon, q }) => (
                  <li key={key}>
                    <span className="lp-snap-name"><Svg d={icon} size={18} /> {q.label}</span>
                    <span className="lp-snap-px">{fmt(q)}</span>
                    <Change pct={q.changePct} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="lp-st-card lp-st-brief">
            <h3 className="lp-st-ctitle"><Svg d={Icon.lock} size={22} /> TBC Member Briefing</h3>
            <p>Sign in to read the full stories, with in-depth analysis, sector reports and exclusive opportunities.</p>
            <Link href="/login" className="lp-st-cta">Sign In to Access →</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
