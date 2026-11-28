'use client';
// src/components/landing/EbenEzer.tsx - Giving back · Eben Ezer
//
// A short note on the Eben Ezer charity visit to a children's cancer ward, with
// the video beside it. The video is user-started (no autoplay), so nothing is
// downloaded beyond its metadata until a visitor presses play. Copy lives in
// landing:ebenEzer.*.

import { Reveal, SplitWordsInView } from './motion';
import { useTranslation } from 'react-i18next';

export default function EbenEzer() {
  const { t } = useTranslation('landing');
  return (
    <section id="eben-ezer" className="lp-section lp-eben">
      <div className="lp-eben-grid">
        <div className="lp-eben-copy">
          <Reveal className="lp-tag lp-tag-alt">{t('ebenEzer.tag')}</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text={t('ebenEzer.title')} />
          </h2>
          <Reveal className="lp-eben-mark" delay={0.06}>
            <img src="/images/partners/webp/eben-exer.png" alt={t('ebenEzer.logoAlt')} width={1143} height={717} loading="lazy" />
          </Reveal>
          <Reveal className="lp-what-lead-text" delay={0.1}>
            {t('ebenEzer.lead')}
          </Reveal>
          <Reveal className="lp-what-body" delay={0.16}>
            <p>{t('ebenEzer.body')}</p>
          </Reveal>
        </div>

        <Reveal className="lp-eben-video" dir="left" delay={0.1} amount={0.15}>
          <video
            controls
            playsInline
            preload="metadata"
            poster="/images/eben-ezer-poster.jpg"
            width={464}
            height={832}
            aria-label={t('ebenEzer.videoLabel')}
          >
            <source src="/videos/eben-ezer-hospital.mp4" type="video/mp4" />
          </video>
        </Reveal>
      </div>
    </section>
  );
}
