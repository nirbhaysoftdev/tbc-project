'use client';
// src/components/landing/Inside.tsx - 08 · What members get access to
//
// Everything listed here maps to a real surface in the member platform
// (/community/deal-room, /community/events, /community/network, /portfolio).

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { EASE, Reveal, SplitWordsInView, StaggerGroup, StaggerItem, enterInView, useCalm } from './motion';
import { useTranslation } from 'react-i18next';

// Icons only; the copy lives in landing:inside.surfaces.<key>.
const SURFACES = [
  { key: 'deal-room', icon: '◆' },
  { key: 'directory', icon: '◈' },
  { key: 'events', icon: '◎' },
  { key: 'wallet', icon: '⬢' },
] as const;

export default function Inside() {
  const { t } = useTranslation('landing');
  const calm = useCalm();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const coinY = useTransform(scrollYProgress, [0, 1], ['6%', '-6%']);
  const coinRotate = useTransform(scrollYProgress, [0, 1], [-8, 8]);

  return (
    <section id="inside" className="lp-section lp-inside" ref={ref}>
      <div className="lp-inside-grid">
        <div className="lp-inside-copy">
          <Reveal className="lp-tag">{t('inside.tag')}</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text={t('inside.heading')} />
          </h2>
          <Reveal className="lp-section-sub lp-align-left" delay={0.1}>
            {t('inside.sub')}
          </Reveal>

          <StaggerGroup className="lp-inside-list" stagger={0.08} as="ul">
            {SURFACES.map((s) => (
              <StaggerItem className="lp-inside-item" as="li" key={s.key}>
                <span className="lp-inside-icon" aria-hidden>
                  {s.icon}
                </span>
                <div>
                  <h3 className="lp-inside-title">{t(`inside.surfaces.${s.key}.title`)}</h3>
                  <p className="lp-inside-body">{t(`inside.surfaces.${s.key}.body`)}</p>
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
