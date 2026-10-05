'use client';
// src/components/landing/Community.tsx - 07 · Explore the community
//
// A cinematic showcase rather than a list with a thumbnail. The active sector
// fills a full-bleed frame with a slow push-in, its name set large over the
// image, and the twelve sectors run as a filmstrip beneath. It advances on
// its own so the section is alive without demanding interaction, and pauses
// the moment anyone touches it.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { INDUSTRIES } from '@/lib/landing-data';
import { onSector } from '@/lib/sector-bus';
import { EASE, Reveal, SplitWordsInView, useCalm } from './motion';

const DWELL_MS = 5200;

export default function Community() {
  const calm = useCalm();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // An explicit choice should stay put rather than being carried off by the
  // carousel a few seconds later.
  const [pinned, setPinned] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.35 });

  const ind = INDUSTRIES[active];
  const running = !calm && inView && !paused && !pinned;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setActive((i) => (i + 1) % INDUSTRIES.length), DWELL_MS);
    return () => clearInterval(id);
  }, [running]);

  const go = useCallback((i: number) => {
    setActive(((i % INDUSTRIES.length) + INDUSTRIES.length) % INDUSTRIES.length);
    setPinned(true);
  }, []);

  // Opened from the sector ring further up the page.
  useEffect(
    () =>
      onSector((key) => {
        const i = INDUSTRIES.findIndex((s) => s.key === key);
        if (i >= 0) go(i);
      }),
    [go],
  );

  // Let the carousel take over again once the section has been left.
  useEffect(() => {
    if (!inView) setPinned(false);
  }, [inView]);

  return (
    <section id="community" className="lp-section lp-community">
      <div className="lp-section-head">
        <Reveal className="lp-tag">Our community</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text="Multiple industries in one room." />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          What each sector brings is, almost always, what somebody in another sector has been
          looking for.
        </Reveal>
      </div>

      <div
        className="lp-show"
        ref={stageRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="lp-show-frame">
          <AnimatePresence initial={false}>
            <motion.img
              key={ind.key}
              src={ind.image}
              alt=""
              className="lp-show-img"
              initial={calm ? false : { opacity: 0, scale: 1.09 }}
              animate={{ opacity: 1, scale: calm ? 1 : 1.0 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: calm ? 0 : 1, ease: EASE.out },
                scale: { duration: calm ? 0 : DWELL_MS / 1000 + 1.4, ease: 'linear' },
              }}
            />
          </AnimatePresence>

          <div className="lp-show-scrim" aria-hidden />

          <div className="lp-show-copy" aria-live="polite">
            <span className="lp-show-index">
              {String(active + 1).padStart(2, '0')}
              <em>/{INDUSTRIES.length}</em>
            </span>
            <AnimatePresence mode="wait">
              <motion.div
                key={ind.key}
                initial={calm ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={calm ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: calm ? 0 : 0.55, ease: EASE.out }}
              >
                <h3 className="lp-show-name">{ind.name}</h3>

                {ind.brands?.length ? (
                  <div className="lp-brandplate">
                    {ind.brands.map((b) => (
                      <div
                        className={`lp-brandplate-item ${b.logo ? '' : 'is-textonly'}`}
                        key={b.name}
                      >
                        {b.logo ? (
                          <span
                            className={`lp-brandplate-logo ${
                              b.plate === 'dark' ? 'is-dark' : ''
                            }`}
                          >
                            <img src={b.logo} alt="" loading="lazy" />
                          </span>
                        ) : null}
                        <span className="lp-brandplate-text">
                          <span className="lp-brandplate-kicker">In this sector</span>
                          <span className="lp-brandplate-name">{b.name}</span>
                        </span>
                        <Link
                          href={b.href ?? '/register'}
                          className="lp-btn lp-btn-outline lp-brandplate-cta"
                        >
                          Know more
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
                <dl className="lp-show-pairs">
                  <div>
                    <dt>Brings</dt>
                    <dd>{ind.brings}</dd>
                  </div>
                  <div>
                    <dt>Looking for</dt>
                    <dd>{ind.seeks}</dd>
                  </div>
                </dl>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dwell indicator - restarts with each sector */}
          {running && (
            <motion.span
              key={`bar-${active}`}
              className="lp-show-bar"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: DWELL_MS / 1000, ease: 'linear' }}
              aria-hidden
            />
          )}
        </div>

        {/* Filmstrip - twelve thumbnails, six across in two rows, so a
           visitor can take in every industry at a glance and jump straight
           to one. */}
        <div className="lp-strip" role="tablist" aria-label="Industry sectors">
          {INDUSTRIES.map((s, i) => {
            const isOn = i === active;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={isOn}
                aria-label={s.name}
                className={`lp-strip-item ${isOn ? 'is-on' : ''}`}
                onClick={() => go(i)}
              >
                <img src={s.image} alt="" className="lp-strip-img" loading="lazy" />
                <span className="lp-strip-overlay" aria-hidden />
                <span className="lp-strip-label">{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Reveal className="lp-community-strap" delay={0.1}>
        Different businesses. Different ideas. Different opportunities.{' '}
        <strong>One community for all.</strong>
      </Reveal>
    </section>
  );
}
