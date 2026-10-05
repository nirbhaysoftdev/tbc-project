'use client';
// src/components/landing/WhyJoin.tsx - 04 · Why join?
//
// Nine equal cards read as a wall and let nothing lead. So the nine outcomes
// are grouped into three tracks - deal flow, capability, compounding - and
// each track gets a rail (index, glyph, label, one line) plus one lead card
// with full-size isometric art and two supporting cards beside it. A chip
// carries the payoff of every card, so the whole section can be understood
// from the chips alone before a word of body copy is read.

import Link from 'next/link';
import { motion } from 'motion/react';
import { WHY_TRACKS, trackCards, type ValueCard, type ValueTrack } from '@/lib/landing-data';
import IsoArt from './IsoArt';
import { EASE, Reveal, SplitWordsInView, StaggerGroup, StaggerItem, useCalm } from './motion';

export default function WhyJoin() {
  return (
    <section id="why" className="lp-section lp-why">
      <div className="lp-section-head">
        <Reveal className="lp-tag">Why join</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text="What membership does for your business." />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          Not “opportunities” in the abstract. Nine things members actually use the community for,
          in the order they tend to happen.
        </Reveal>
      </div>

      {/* Chip summary: the entire argument in one scannable line-up. */}
      <StaggerGroup className="lp-why-legend" stagger={0.05}>
        {WHY_TRACKS.map((t) => (
          <StaggerItem className="lp-why-legend-item" key={t.key}>
            <TrackGlyph kind={t.key} />
            <span className="lp-why-legend-n">{t.n}</span>
            <span className="lp-why-legend-label">{t.label}</span>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <div className="lp-why-tracks">
        {WHY_TRACKS.map((track) => (
          <Track track={track} key={track.key} />
        ))}
      </div>

      <Reveal className="lp-value-foot" delay={0.1}>
        <span>Any one of these pays for the membership. Most members use several.</span>
        <Link href="/register" className="lp-btn lp-btn-outline">
          Apply for membership →
        </Link>
      </Reveal>
    </section>
  );
}

/* ── One track ────────────────────────────────────── */

function Track({ track }: { track: ValueTrack }) {
  const [lead, ...rest] = trackCards(track);

  return (
    <article className="lp-why-track">
      <Reveal className="lp-why-rail">
        <span className="lp-why-rail-n">{track.n}</span>
        <span className="lp-why-rail-glyph" aria-hidden>
          <TrackGlyph kind={track.key} />
        </span>
        <h3 className="lp-why-rail-label">{track.label}</h3>
        <p className="lp-why-rail-line">{track.line}</p>
        <span className="lp-why-rail-spine" aria-hidden />
      </Reveal>

      <StaggerGroup className="lp-why-grid" stagger={0.06}>
        {lead ? (
          <StaggerItem className="lp-why-cell is-lead" as="div">
            <Lead card={lead} track={track} />
          </StaggerItem>
        ) : null}
        {rest.map((c) => (
          <StaggerItem className="lp-why-cell" as="div" key={c.key}>
            <Support card={c} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </article>
  );
}

/* ── Lead card ────────────────────────────────────── */

function Lead({ card, track }: { card: ValueCard; track: ValueTrack }) {
  const calm = useCalm();

  return (
    <motion.div
      className="lp-why-card is-lead"
      whileHover={calm ? undefined : { y: -5 }}
      transition={{ duration: 0.35, ease: EASE.out }}
    >
      <span className="lp-why-card-grid" aria-hidden />
      <div className="lp-why-art" aria-hidden>
        <span className="lp-why-art-glow" />
       
        <figure className="lp-why-photo">
          <img src={track.image} alt={track.alt} loading="lazy" decoding="async" width={560} height={315} />
          <span className="lp-why-photo-scrim" aria-hidden />
          <figcaption>{track.label}</figcaption>
        </figure>
      </div>
      <div className="lp-why-copy">
        <span className="lp-why-chip">
          <i aria-hidden>{card.icon}</i>
          {card.tag}
        </span>
        <h4 className="lp-why-title">{card.title}</h4>
        <p className="lp-why-body">{card.body}</p>
      </div>
      <span className="lp-why-edge" aria-hidden />
    </motion.div>
  );
}

/* ── Supporting card ──────────────────────────────── */

function Support({ card }: { card: ValueCard }) {
  const calm = useCalm();

  return (
    <motion.div
      className="lp-why-card"
      whileHover={calm ? undefined : { y: -5 }}
      transition={{ duration: 0.35, ease: EASE.out }}
    >
      <div className="lp-why-art lp-why-art-sm" aria-hidden>
        
      </div>
      <span className="lp-why-chip is-quiet">
        <i aria-hidden>{card.icon}</i>
        {card.tag}
      </span>
      <h4 className="lp-why-title is-sm">{card.title}</h4>
      <p className="lp-why-short">{card.short ?? card.body}</p>
      <span className="lp-why-edge" aria-hidden />
    </motion.div>
  );
}

/* ── Track glyphs ─────────────────────────────────────
   One small diagram per track, drawn rather than iconified: three paths
   converging (flow), two halves locking (capability), three widening arcs
   (compounding). Same stroke weight as the isometric art so they read as
   one drawing system. */

function TrackGlyph({ kind }: { kind: string }) {
  return (
    <svg className="lp-why-glyph" viewBox="0 0 28 28" aria-hidden focusable="false">
      {kind === 'flow' ? (
        <>
          <path d="M3 6h9c5 0 4 8 9 8h4" />
          <path d="M3 14h7" />
          <path d="M3 22h9c5 0 4-8 9-8h4" />
          <path d="M21 10.5 25 14l-4 3.5" className="lp-why-glyph-hi" />
        </>
      ) : kind === 'capability' ? (
        <>
          <path d="M12 5H5v18h7" />
          <path d="M16 5h7v18h-7" />
          <path d="M11 14h6" className="lp-why-glyph-hi" />
          <circle cx="14" cy="14" r="2" className="lp-why-glyph-hi" />
        </>
      ) : (
        <>
          <path d="M4 23c0-7 5-12 12-12" />
          <path d="M4 23c0-11 8-19 19-19" className="lp-why-glyph-hi" />
          <circle cx="4" cy="23" r="1.6" />
          <circle cx="23" cy="4" r="2.2" className="lp-why-glyph-hi" />
        </>
      )}
    </svg>
  );
}
