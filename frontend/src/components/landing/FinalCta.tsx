'use client';
// src/components/landing/FinalCta.tsx - 09 · Join the community

import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE, Reveal, SplitWordsInView, enterInView, useCalm } from './motion';
import { useTranslation } from 'react-i18next';

// Numerals and keys only; the copy lives in landing:finalCta.steps.<key>.
// `t` as a field name is gone — it shadowed the translator function.
const NEXT_STEPS = [
  { n: '01', key: 'apply' },
  { n: '02', key: 'verify' },
  { n: '03', key: 'join' },
] as const;

export default function FinalCta() {
  const { t } = useTranslation('landing');
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

        <span className="lp-tag">{t('finalCta.tag')}</span>
        <h2 className="lp-cta-title">
          <SplitWordsInView text={t('finalCta.heading')} />
        </h2>
        <p className="lp-cta-sub">{t('finalCta.sub')}</p>

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
              <span className="lp-cta-step-t">{t(`finalCta.steps.${s.key}.title`)}</span>
              <span className="lp-cta-step-s">{t(`finalCta.steps.${s.key}.sub`)}</span>
            </motion.li>
          ))}
        </ol>

        <div className="lp-cta-actions">
          <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
            <span>{t('finalCta.apply')}</span>
            {/* Forward arrow — mirrors with the text in RTL. */}
            <svg className="rtl-mirror" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link href="/login" className="lp-btn lp-btn-outline lp-btn-lg">
            {t('finalCta.alreadyMember')}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
