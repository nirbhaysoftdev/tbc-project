'use client';
// src/components/landing/Aladino.tsx - Our project · ALADINO
//
// A short introduction to ALADINO and the seven industries it runs in. Both
// calls to action leave the portal for the product's own site, so they are
// plain external links. Copy lives in landing:aladino.*.

import { Reveal, SplitWordsInView, StaggerGroup, StaggerItem } from './motion';
import { useTranslation } from 'react-i18next';

const ALADINO_URL = 'https://aladino.trillionbusinesscommunity.com/';
const ALADINO_INDUSTRIES_URL = `${ALADINO_URL}industries`;

const INDUSTRY_KEYS = ['petrol', 'home', 'logistics', 'hospital', 'hotel', 'restaurant', 'government'] as const;

export default function Aladino() {
  const { t } = useTranslation('landing');
  return (
    <section id="aladino" className="lp-section lp-aladino">
      <div className="lp-aladino-grid">
        <div className="lp-aladino-copy">
          <Reveal className="lp-tag lp-tag-alt">{t('aladino.tag')}</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text={t('aladino.title')} />
          </h2>
          <Reveal className="lp-aladino-mark" delay={0.06}>
            <img src="/images/aladino-logo.webp" alt={t('aladino.logoAlt')} width={900} height={501} loading="lazy" />
            <span className="lp-aladino-reg" aria-hidden>®</span>
          </Reveal>
          <Reveal className="lp-what-lead-text" delay={0.1}>
            {t('aladino.lead')}
          </Reveal>
          <Reveal className="lp-what-body" delay={0.16}>
            <p>{t('aladino.body')}</p>
          </Reveal>
          <Reveal className="lp-aladino-actions" delay={0.22}>
            <a href={ALADINO_URL} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary lp-btn-lg">
              {t('aladino.learnMore')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </Reveal>
        </div>

        <Reveal className="lp-aladino-logo" dir="left" delay={0.1} amount={0.15}>
          <img
            className="lp-aladino-photo"
            src="/images/aladino-retail-robot-700.webp"
            srcSet="/images/aladino-retail-robot-700.webp 700w, /images/aladino-retail-robot-1200.webp 1254w"
            sizes="(max-width: 900px) 90vw, 460px"
            alt={t('aladino.robotAlt')}
            width={1254}
            height={1254}
            loading="lazy"
          />
        </Reveal>
      </div>

      <div className="lp-aladino-industries">
        <h3 className="lp-aladino-sub">{t('aladino.industriesTitle')}</h3>
        <p className="lp-aladino-sublead">{t('aladino.industriesLead')}</p>
        <StaggerGroup className="lp-aladino-list" stagger={0.06}>
          {INDUSTRY_KEYS.map((k) => (
            <StaggerItem className="lp-aladino-card" key={k}>
              <span className="lp-aladino-card-name">ALADINO {t(`aladino.industries.${k}.name`)}</span>
              <span className="lp-aladino-card-sub">{t(`aladino.industries.${k}.sub`)}</span>
              <span className="lp-aladino-card-desc">{t(`aladino.industries.${k}.desc`)}</span>
              <a
                href={`${ALADINO_URL}industry-${k}`}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-aladino-card-link"
                aria-label={`${t('aladino.learnMore')}: ALADINO ${t(`aladino.industries.${k}.name`)}`}
              >
                {t('aladino.learnMore')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <a href={ALADINO_INDUSTRIES_URL} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-outline lp-aladino-all">
          {t('aladino.viewIndustries')}
        </a>
      </div>
    </section>
  );
}
