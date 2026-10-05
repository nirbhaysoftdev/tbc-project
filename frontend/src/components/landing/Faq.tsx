'use client';
// src/components/landing/Faq.tsx
// Height-animated disclosure via Motion, so the panel opens smoothly without
// the max-height guesswork the CSS version relied on.

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { FAQS } from '@/lib/landing-data';
import { EASE, Reveal, SplitWordsInView, useCalm } from './motion';

export default function Faq() {
  const calm = useCalm();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="lp-section lp-faq-section">
      <div className="lp-faq-grid">
        <div className="lp-faq-intro">
          <Reveal className="lp-tag">FAQ</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text="Answers, before you ask." />
          </h2>
          <Reveal className="lp-section-sub lp-align-left" delay={0.1}>
            What the community is, who it is for, and what membership gets you.
          </Reveal>
          <Reveal delay={0.16}>
            <Link href="/register" className="lp-btn lp-btn-outline">
              Still curious? Apply →
            </Link>
          </Reveal>
        </div>

        <div className="lp-faq-list">
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <Reveal
                className={`lp-faq ${isOpen ? 'lp-faq-open' : ''}`}
                key={faq.q}
                delay={i * 0.05}
                amount={0.3}
              >
                <button
                  className="lp-faq-head"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="lp-faq-num" aria-hidden>
                    0{i + 1}
                  </span>
                  <span className="lp-faq-q">{faq.q}</span>
                  <motion.span
                    className="lp-faq-icon"
                    aria-hidden
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: calm ? 0 : 0.35, ease: EASE.out }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="lp-faq-body"
                      initial={calm ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: calm ? 0 : 0.4, ease: EASE.soft }}
                    >
                      <p className="lp-faq-body-inner">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
