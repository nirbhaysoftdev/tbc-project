'use client';
// src/components/landing/GlobalReach.tsx - 02B · Institutional advantages
//
// Content and structure ported from the reference design given for this
// section (hub strip, filterable privilege cards) - rebuilt with this
// site's own tokens/type/motion instead of the Tailwind/Syne/Jakarta Sans
// it was drafted in, and tightened for a single compact section rather
// than a standalone page.

import { useState } from 'react';
import { ADVANTAGE_COUNTRIES, ADVANTAGES, type AdvCard } from '@/lib/landing-data';
import { Reveal, SplitWordsInView } from './motion';

const ICONS: Record<AdvCard['icon'], string> = {
  bank: 'M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 3l9 7H3l9-7z',
  shield:
    'M9 12l2 2 4-4m5.6-4A12 12 0 0012 3 12 12 0 003 9c0 5.6 3.8 10.3 9 11.6 5.2-1.3 9-6 9-11.6 0-2-.1-2.1-.4-3.4z',
  legal: 'M12 3v18M6 7l-3 7a3 3 0 006 0zM18 7l-3 7a3 3 0 006 0zM4 21h16M6 7l6-2 6 2z',
  jet: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  hotel:
    'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  estate: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  medical:
    'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  media: 'M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
};

function Icon({ name, className }: { name: AdvCard['icon']; className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function GlobalReach() {
  const [cat, setCat] = useState<'all' | AdvCard['cat']>('all');

  const cards = cat === 'all' ? ADVANTAGES.cards : ADVANTAGES.cards.filter((c) => c.cat === cat);

  return (
    <section className="lp-section lp-adv" id="advantages">
      <div className="lp-section-head">
        <Reveal className="lp-tag">{ADVANTAGES.tag}</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text={ADVANTAGES.title} />{' '}
          <SplitWordsInView text={ADVANTAGES.titleAccent} delay={0.12} className="lp-adv-accent" />
        </h2>
        <Reveal className="lp-section-sub" delay={0.18}>
          {ADVANTAGES.sub}
        </Reveal>
      </div>

      {/* Hub strip */}
      <Reveal className="lp-adv-strip" delay={0.1}>
        <div className="lp-adv-strip-head">
          <span className="lp-adv-strip-title">80+ jurisdictions</span>
          <span className="lp-adv-strip-badge">Active corridors</span>
        </div>

        <div className="lp-adv-hubs">
          {ADVANTAGES.hubs.map((h) => (
            <span key={h.key} className={`lp-adv-hub ${h.tag ? 'is-hq' : ''}`}>
              <span aria-hidden>{h.flag}</span> {h.label}
              {h.tag && <span className="lp-adv-hub-tag">{h.tag}</span>}
            </span>
          ))}
          <span className="lp-adv-hub lp-adv-hub-more">
            +{ADVANTAGE_COUNTRIES.length - ADVANTAGES.hubs.length} more regions
          </span>
        </div>
      </Reveal>

      {/* Filters */}
      <div className="lp-adv-filters">
        <button
          type="button"
          className={`lp-adv-filter ${cat === 'all' ? 'is-on' : ''}`}
          onClick={() => setCat('all')}
        >
          All privileges ({ADVANTAGES.cards.length})
        </button>
        {ADVANTAGES.categories.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`lp-adv-filter ${cat === c.key ? 'is-on' : ''}`}
            onClick={() => setCat(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="lp-adv-grid">
        {cards.map((card, i) => (
          <Reveal className="lp-adv-card" as="article" key={card.key} delay={i * 0.04} amount={0.15}>
            <div className="lp-adv-card-head">
              <span className="lp-adv-card-icon">
                <Icon name={card.icon} />
              </span>
              <div className="lp-adv-card-heading">
                <h3>{card.title}</h3>
                <span>{card.subtitle}</span>
              </div>
              <span className="lp-adv-card-badge">{card.badge}</span>
            </div>

            {card.brands && (
              <div className="lp-adv-brands">
                {card.brands.map((b) => (
                  <div key={b.key} className={`lp-adv-brand ${b.wide ? 'is-wide' : ''}`}>
                    {b.logo ? (
                      <img src={b.logo} alt="" className="lp-adv-brand-logo" loading="lazy" />
                    ) : (
                      <span className="lp-adv-brand-mono">{b.mono ?? b.name[0]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="lp-adv-card-foot" />
          </Reveal>
        ))}
      </div>

      {/* Bottom SLA banner */}
      <Reveal className="lp-adv-sla" delay={0.1}>
        <div className="lp-adv-sla-text">
          <span className="lp-adv-sla-tick" aria-hidden>
            ✓
          </span>
          <div>
            <strong>Direct bilateral service level agreements</strong>
            <span>Every partner listed operates under a formal commercial trust agreement with the community.</span>
          </div>
        </div>
        <button type="button" className="lp-btn lp-btn-primary">
          Inquire full portfolio
        </button>
      </Reveal>
    </section>
  );
}
