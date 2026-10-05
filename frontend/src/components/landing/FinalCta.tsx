'use client';
// src/components/landing/FinalCta.tsx - 09 · Join the community

import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE, Reveal, SplitWordsInView, enterInView, useCalm } from './motion';

const NEXT_STEPS = [
  { n: '01', t: 'Apply', s: 'Tell us about your business and what you bring.' },
  { n: '02', t: 'Verify', s: 'Complete your profile and identity check.' },
  { n: '03', t: 'Join the room', s: 'Approved members get full access to the community.' },
];

export default function FinalCta() {
  const calm = useCalm();

  return (
    <section className="lp-cta-section">
      <Reveal className="lp-cta-inner" amount={0.2}>
        <motion.div
          className="lp-cta-glow"
          aria-hidden
          animate={calm ? undefined : { opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}
        />

        <span className="lp-tag">Membership by application</span>
        <h2 className="lp-cta-title">
          <SplitWordsInView text="Step inside the community." />
        </h2>
        <p className="lp-cta-sub">
          Bring a business, an idea or capital. Leave with the people who can turn it into
          something.
        </p>

        <ol className="lp-cta-steps">
          {NEXT_STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              className="lp-cta-step"
              {...enterInView(
                calm,
                { opacity: 0, y: 14 },
                { duration: 0.55, ease: EASE.out, delay: i * 0.1 },
                { once: true, amount: 0.6 },
              )}
            >
              <span className="lp-cta-step-n">{s.n}</span>
              <span className="lp-cta-step-t">{s.t}</span>
              <span className="lp-cta-step-s">{s.s}</span>
            </motion.li>
          ))}
        </ol>

        <div className="lp-cta-actions">
          <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
            <span>Apply for membership</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link href="/login" className="lp-btn lp-btn-outline lp-btn-lg">
            I’m already a member
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
