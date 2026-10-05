'use client';
// src/components/landing/Hero.tsx
//
// The first impression is the room itself: members of the community in session,
// the emblem on the wall behind them. The photograph runs full-bleed with a
// scrim carrying it into the page's palette, and the copy sits in the calm
// left third. The opportunity-flow diagram that used to live here now opens
// the "What it is" section, where it has room to be read.

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { HERO, STATS } from '@/lib/landing-data';
import HeroOverlay from './HeroOverlay';
import ScrollCue from './ScrollCue';
import { EASE, SplitWords, enter, useCalm } from './motion';

export default function Hero() {
  const calm = useCalm();
  const sectionRef = useRef<HTMLElement>(null);

  // The photograph holds back as the page moves on - the single strongest
  // scroll cue on the site, so it gets the largest travel of any parallax.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const photoY = useSpring(useTransform(scrollYProgress, [0, 1], ['0%', '14%']), {
    stiffness: 110,
    damping: 30,
  });
  const copyY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -48]), {
    stiffness: 110,
    damping: 30,
  });

  const fade = (delay: number) =>
    enter(calm, { opacity: 0, y: 18 }, { duration: 0.8, ease: EASE.out, delay });

  return (
    <section className="lp-hero" ref={sectionRef}>
      <div className="lp-hero-media" aria-hidden>
        <motion.img
          src="/images/community-lounge-1600.webp"
          srcSet="/images/community-lounge-900.webp 900w, /images/community-lounge-1600.webp 1600w"
          sizes="100vw"
          alt=""
          decoding="async"
          className="lp-hero-img"
          style={calm ? undefined : { y: photoY }}
          initial={calm ? false : { opacity: 0, scale: 1.08 }}
          animate={calm ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1.08, 1, 1.04] }}
          transition={
            calm
              ? { duration: 0 }
              : {
                  opacity: { duration: 1.6, ease: EASE.out },
                  scale: { duration: 26, ease: 'easeInOut', times: [0, 0.18, 1] },
                }
          }
        />
        <div className="lp-hero-scrim" />
        <div className="lp-hero-scrim-b" />
      </div>

      <HeroOverlay />

      <motion.div className="lp-hero-inner" style={calm ? undefined : { y: copyY }}>
        <div className="lp-hero-copy">
          <motion.div className="lp-eyebrow" {...fade(0.15)}>
            <span className="lp-eyebrow-dot" />
            {HERO.eyebrow}
          </motion.div>

          <h1 className="lp-hero-title">
            <SplitWords text={HERO.titleLead} delay={0.3} />{' '}
            <SplitWords text={HERO.titleMid} delay={0.45} className="lp-hero-dim" />{' '}
            <SplitWords
              text={HERO.titleAccent}
              delay={0.62}
              className="lp-hero-accent"
              split={false}
            />
          </h1>

          <motion.p className="lp-hero-desc" {...fade(0.85)}>
            {HERO.desc}
          </motion.p>

          <motion.div className="lp-hero-actions" {...fade(0.98)}>
            <Link href={HERO.primary.href} className="lp-btn lp-btn-primary lp-btn-lg">
              <span>{HERO.primary.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a href={HERO.secondary.href} className="lp-btn lp-btn-outline lp-btn-lg">
              {HERO.secondary.label}
            </a>
          </motion.div>

          <motion.dl className="lp-hero-facts" {...fade(1.1)}>
            {STATS.map((s) => (
              <div className="lp-hero-fact" key={s.label}>
                <dt>
                  {s.value}
                  {s.suffix}
                </dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </motion.div>

      <ScrollCue to="#what" />
    </section>
  );
}
