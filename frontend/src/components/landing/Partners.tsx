'use client';
// src/components/landing/Partners.tsx - 07 · Partners
//
// A 3D coverflow: the active logo sits flat and largest in the centre,
// the rest fan away in a shallow ring on either side, turned in perspective
// and scaled down with distance. Autoplay idles it forward, arrows and dots
// jump straight to a card, and clicking a side card brings it to centre.

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { PARTNERS, partnerIndustryLabel, type PartnerCategory } from '@/lib/landing-data';
import { Reveal, SplitWordsInView, useCalm, useMediaQuery } from './motion';
import { useTranslation } from 'react-i18next';

// Keys only; labels come from landing:partners.* so the tab strip is
// translatable if more categories are enabled later.
const CATEGORY_TABS: { key: PartnerCategory | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'partners.all' },
];

const AUTOPLAY_MS = 3400;
const VISIBLE = 3;
const ANGLE_STEP = 30;
const DOT_WINDOW = 7;

/** Shortest signed distance between two indices on a wrapping ring, so
   cards always fan out the short way round instead of unwinding past
   the end. */
function ringDiff(i: number, active: number, total: number) {
  let d = i - active;
  if (d > total / 2) d -= total;
  if (d < -total / 2) d += total;
  return d;
}

function dotSlots(active: number, total: number) {
  if (total <= DOT_WINDOW) {
    return Array.from({ length: total }, (_, i) => ({ item: i, dash: false }));
  }
  const half = Math.floor(DOT_WINDOW / 2);
  return Array.from({ length: DOT_WINDOW }, (_, slot) => ({
    item: ((active - half + slot) % total + total) % total,
    dash: slot === 0 || slot === DOT_WINDOW - 1,
  }));
}

export default function Partners() {
  const { t } = useTranslation('landing');
  const calm = useCalm();
  const compact = useMediaQuery('(max-width: 720px)');
  const [cat, setCat] = useState<PartnerCategory | 'all'>('all');
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);

  const shown = cat === 'all' ? PARTNERS : PARTNERS.filter((p) => p.category === cat);
  const activeLabel = t(CATEGORY_TABS.find((c) => c.key === cat)!.labelKey);
  const total = shown.length;
  const active = total > 0 ? ((Math.round(pos) % total) + total) % total : 0;

  useEffect(() => setPos(0), [cat]);

  // Continuous ring scroll: advance `pos` every frame rather than jumping
  // on an interval, so the ring glides instead of snapping.
  useEffect(() => {
    if (calm || paused || total < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setPos((p) => {
        const next = p + dt / AUTOPLAY_MS;
        return ((next % total) + total) % total;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [calm, paused, total]);

  const go = useCallback(
    (i: number) => {
      if (total < 1) return;
      setPos(((i % total) + total) % total);
    },
    [total],
  );

  const spacing = compact ? 108 : 190;
  const zStep = compact ? 34 : 60;

  return (
    <section id="partners" className="lp-section lp-partners-section lp-partners-light">
      <div className="lp-section-head">
        <Reveal className="lp-tag">{t('partners.tag')}</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text={t('partners.heading')} />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          {t('partners.sub')}
        </Reveal>
      </div>

      {/* <div className="lp-partner-tabs" role="tablist" aria-label={t('partners.categoriesAria')}>
        {CATEGORY_TABS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={cat === c.key}
            className={`lp-partner-tab ${cat === c.key ? 'is-on' : ''}`}
            onClick={() => setCat(c.key)}
          >
            <span className="lp-partner-tab-label">{c.label}</span>
            {cat === c.key && <span className="lp-partner-tab-ring" aria-hidden />}
          </button>
        ))}
      </div> */}
      

      {total === 0 ? (
        <p className="lp-partner-empty">Categories are being sorted - check back soon.</p>
      ) : (
        <>
          <div
            className="lp-cf"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            {total > 1 && (
              <button
                type="button"
                className="lp-cf-arrow lp-cf-arrow-prev"
                aria-label={t('partners.prev')}
                onClick={() => go(active - 1)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            )}

            <div className="lp-cf-stage">
              {shown.map((p, i) => {
                const diff = ringDiff(i, pos, total);
                const dist = Math.abs(diff);
                if (dist > VISIBLE) return null;
                const isOn = i === active;
                const scale = isOn ? 1 : Math.max(0.6, 1 - dist * 0.14);
                const opacity = isOn ? 1 : Math.max(0, 1 - dist * 0.22);
                const style: CSSProperties = {
                  transform: `translate(-50%, -50%) translateX(${diff * spacing}px) translateZ(${-dist * zStep}px) rotateY(${diff * -ANGLE_STEP}deg) scale(${scale})`,
                  zIndex: 50 - dist,
                  opacity,
                  pointerEvents: dist > VISIBLE ? 'none' : 'auto',
                };
                return (
                  <button
                    key={p.src}
                    type="button"
                    className={`lp-cf-card ${isOn ? 'is-on' : ''}`}
                    style={style}
                    onClick={() => go(i)}
                    aria-label={p.name ?? t('partners.fallbackName')}
                    aria-current={isOn}
                    tabIndex={dist > 1 ? -1 : 0}
                  >
                    <img src={p.src} alt={p.name ?? t('partners.fallbackName')} loading="lazy" />
                    {/* The partner's NAME is a proper noun and stays as stored;
                        the industry LABEL is translated. */}
                    {p.industry && (
                      <span className="lp-cf-card-industry">{partnerIndustryLabel(t, p.industry)}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {total > 1 && (
              <button
                type="button"
                className="lp-cf-arrow lp-cf-arrow-next"
                aria-label={t('partners.next')}
                onClick={() => go(active + 1)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>

          {total > 1 && (
            <div className="lp-cf-dots" role="tablist" aria-label={t('aria.partnerSlides')}>
              {dotSlots(active, total).map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`lp-cf-dot ${s.dash ? 'is-dash' : ''} ${s.item === active ? 'is-on' : ''}`}
                  aria-label={s.dash ? undefined : shown[s.item]?.name ?? `Slide ${s.item + 1}`}
                  aria-hidden={s.dash}
                  tabIndex={s.dash ? -1 : 0}
                  onClick={() => !s.dash && go(s.item)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
