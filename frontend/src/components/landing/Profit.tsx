'use client';
// src/components/landing/Profit.tsx - 07B · Universal Profit
//
// Visual-first by design: the argument is a flow (activity -> fund -> members),
// so it's drawn as one, not explained in three paragraphs. Each node carries a
// short line; the fuller explanation is the title attribute, not printed copy.
// Presented strictly as a proposed framework throughout - "designed to",
// "would be", "intended to" - never firmer than the source copy.

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { PROFIT } from '@/lib/landing-data';
import { EASE, Reveal, SplitWordsInView, StaggerGroup, StaggerItem, enterInView, useCalm } from './motion';

export default function Profit() {
  const calm = useCalm();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="profit" className="lp-section lp-profit-section">
      <div className="lp-section-head">
        <Reveal className="lp-tag lp-tag-alt">{PROFIT.tag}</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text={PROFIT.title} />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          {PROFIT.lead}
        </Reveal>
      </div>

      {/* The flow: value moving left to right through three nodes. */}
      <div className="lp-profit-flow" aria-label="Business activity leads to the Universal Profit Fund, which leads to eligible members">
        {PROFIT.steps.map((s, i) => (
          <div className="lp-profit-flow-item" key={s.key}>
            <motion.div
              className="lp-profit-node"
              title={s.body}
              {...enterInView(calm, { opacity: 0, scale: 0.85, y: 16 }, { duration: 0.6, ease: EASE.arrive, delay: i * 0.12 })}
            >
              <span className="lp-profit-node-ring" aria-hidden />
              <span className="lp-profit-node-n" aria-hidden>{s.n}</span>
              <span className="lp-profit-node-icon" aria-hidden>{s.icon}</span>
              <h3 className="lp-profit-node-title">{s.title}</h3>
              <p className="lp-profit-node-line">{s.line}</p>
            </motion.div>

            {i < PROFIT.steps.length - 1 && (
              <div className="lp-profit-connector" aria-hidden>
                <span className="lp-profit-connector-line" />
                <span className="lp-profit-connector-dot lp-dot-a" />
                <span className="lp-profit-connector-dot lp-dot-b" />
                <span className="lp-profit-connector-dot lp-dot-c" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Two ways to participate */}
      <StaggerGroup className="lp-profit-tracks" stagger={0.1} amount={0.3}>
        {PROFIT.tracks.map((t) => (
          <StaggerItem className="lp-profit-track" as="article" key={t.key}>
            <span className="lp-profit-track-icon" aria-hidden>{t.icon}</span>
            <div>
              <h4 className="lp-profit-track-title">{t.title}</h4>
              <p className="lp-profit-track-line">{t.line}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {/* Meaningful participation - icon chips, not sentences */}
      <Reveal className="lp-profit-ways" amount={0.3}>
        <h3 className="lp-profit-subtitle">{PROFIT.waysTitle}</h3>
        <p className="lp-profit-ways-lead">{PROFIT.waysLead}</p>

        <StaggerGroup className="lp-profit-chips" stagger={0.06} amount={0.3} as="ul">
          {PROFIT.ways.map((w) => (
            <StaggerItem className="lp-profit-chip" as="li" key={w.label}>
              <span aria-hidden>{w.icon}</span>
              {w.label}
            </StaggerItem>
          ))}
        </StaggerGroup>

        <p className="lp-profit-ways-note">{PROFIT.waysNote}</p>
      </Reveal>

      {/* Mini FAQ */}
      <div className="lp-profit-faqs">
        {PROFIT.faqs.map((faq, i) => {
          const isOpen = openFaq === i;
          return (
            <Reveal className={`lp-faq lp-profit-faq ${isOpen ? 'lp-faq-open' : ''}`} key={faq.q} delay={i * 0.05} amount={0.3}>
              <button
                className="lp-faq-head"
                onClick={() => setOpenFaq(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="lp-faq-num" aria-hidden>0{i + 1}</span>
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

      {/* CTA */}
      <Reveal className="lp-profit-cta" amount={0.3}>
        <motion.div
          className="lp-profit-cta-glow"
          aria-hidden
          animate={calm ? undefined : { opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}
        />
        <h3 className="lp-profit-cta-title">{PROFIT.ctaTitle}</h3>
        <p className="lp-profit-cta-body">{PROFIT.ctaBody}</p>
        <div className="lp-profit-cta-actions">
          <Link href={PROFIT.primary.href} className="lp-btn lp-btn-primary">
            {PROFIT.primary.label}
          </Link>
          <Link href={PROFIT.secondary.href} className="lp-btn lp-btn-outline">
            {PROFIT.secondary.label}
          </Link>
        </div>
        <p className="lp-profit-disclaimer">{PROFIT.disclaimer}</p>
      </Reveal>
    </section>
  );
}
