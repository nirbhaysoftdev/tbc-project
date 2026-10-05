'use client';
// src/components/landing/Inside.tsx - 08 · What members get access to
//
// Everything listed here maps to a real surface in the member platform
// (/community/deal-room, /community/events, /community/network, /portfolio).

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { EASE, Reveal, SplitWordsInView, StaggerGroup, StaggerItem, enterInView, useCalm } from './motion';

const SURFACES = [
  {
    key: 'deal-room',
    icon: '◆',
    title: 'The Deal Room',
    body: 'Live projects members have brought in - what is being built, what it needs, who is already on it.',
  },
  {
    key: 'directory',
    icon: '◈',
    title: 'The member directory',
    body: 'Who is in the community, what they do, and what they are looking for - searchable by industry.',
  },
  {
    key: 'events',
    icon: '◎',
    title: 'Events and sessions',
    body: 'Members meet in person and online to put real opportunities in front of each other.',
  },
  {
    key: 'wallet',
    icon: '⬢',
    title: 'Your member account',
    body: 'Track what your participation in the community has returned, in one place.',
  },
];

export default function Inside() {
  const calm = useCalm();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const coinY = useTransform(scrollYProgress, [0, 1], ['6%', '-6%']);
  const coinRotate = useTransform(scrollYProgress, [0, 1], [-8, 8]);

  return (
    <section id="inside" className="lp-section lp-inside" ref={ref}>
      <div className="lp-inside-grid">
        <div className="lp-inside-copy">
          <Reveal className="lp-tag">Inside the community</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text="What membership opens." />
          </h2>
          <Reveal className="lp-section-sub lp-align-left" delay={0.1}>
            Approved members get the room, and the tools that keep it working between meetings.
          </Reveal>

          <StaggerGroup className="lp-inside-list" stagger={0.08} as="ul">
            {SURFACES.map((s) => (
              <StaggerItem className="lp-inside-item" as="li" key={s.key}>
                <span className="lp-inside-icon" aria-hidden>
                  {s.icon}
                </span>
                <div>
                  <h3 className="lp-inside-title">{s.title}</h3>
                  <p className="lp-inside-body">{s.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>

        <div className="lp-inside-visual" aria-hidden>
          <div className="lp-coin-halo" />
          <motion.img
            src="/images/coin-front-660.webp"
            alt=""
            className="lp-coin-image"
            loading="lazy"
            style={calm ? undefined : { y: coinY, rotate: coinRotate }}
            {...enterInView(calm, { opacity: 0, scale: 0.9 }, { duration: 1, ease: EASE.out })}
          />
          <div className="lp-coin-shadow" />
        </div>
      </div>
    </section>
  );
}
