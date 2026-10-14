'use client';
// src/components/landing/Nav.tsx

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { EASE, T, enter, useCalm } from './motion';
import LanguageSelector from '@/components/i18n/LanguageSelector';

// `href` is the anchor id and stays in English: it is part of the URL and a
// shared route, not display text (§3 "do not translate routes"). Only `key`
// is translated.
const LINKS = [
  { href: '#what', key: 'what' },
  { href: '#advantages', key: 'advantages' },
  { href: '#how-it-works', key: 'howItWorks' },
  { href: '#profit', key: 'profit' },
  { href: '#faq', key: 'faq' },
];

export default function Nav() {
  const { t } = useTranslation(['nav', 'common']);
  const calm = useCalm();
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (y) => setCondensed(y > 24));

  // Lock the page while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <motion.header
        className={`lp-nav ${condensed ? 'lp-nav-condensed' : ''}`}
        {...enter(calm, { y: -28, opacity: 0 }, { duration: 0.7, ease: EASE.out, delay: 0.1 })}
      >
        <Link href="/" className="lp-nav-brand" aria-label={t('nav:landing.home')}>
          <span className="lp-brand-mark">
            <img src="/images/tbc-logo-96.webp" alt="" width={60} height={60} />
          </span>
          <span className="lp-brand-text">
            <span className="lp-brand-name">{t('common:brand.name')}</span>
            <span className="lp-brand-sub">{t('common:brand.sub')}</span>
          </span>
        </Link>

        <nav className="lp-nav-links" aria-label={t('nav:landing.sections')}>
          {LINKS.map((l) => (
            <a href={l.href} key={l.href}>
              {t(`nav:landing.${l.key}`)}
            </a>
          ))}
        </nav>

        <div className="lp-nav-cta">
          {/* Public entry point for language choice (§4): a visitor must be able
              to read the landing page in their language before they ever sign in. */}
          <LanguageSelector variant="bar" />
          <Link href="/login" className="lp-btn lp-btn-ghost">
            {t('nav:landing.memberLogin')}
          </Link>
          <Link href="/register" className="lp-btn lp-btn-primary">
            <span>{t('nav:landing.apply')}</span>
            {/* A forward-pointing arrow IS directional, so it mirrors with the
                text in Persian and Arabic. See .rtl-mirror in globals.css. */}
            <svg className="rtl-mirror" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <button
            className="lp-nav-burger"
            onClick={() => setOpen(true)}
            aria-label={t('common:a11y.openMenu')}
            aria-expanded={open}
          >
            <span />
            <span />
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="lp-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('common:a11y.openMenu')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
          >
            <motion.div
              className="lp-sheet-panel"
              initial={calm ? undefined : { y: -18, opacity: 0 }}
              animate={calm ? undefined : { y: 0, opacity: 1 }}
              exit={calm ? undefined : { y: -12, opacity: 0 }}
              transition={T.base}
            >
              <button className="lp-sheet-close" onClick={() => setOpen(false)} aria-label={t('common:a11y.closeMenu')}>
                ✕
              </button>
              <nav className="lp-sheet-links">
                {LINKS.map((l) => (
                  <a href={l.href} key={l.href} onClick={() => setOpen(false)}>
                    {t(`nav:landing.${l.key}`)}
                  </a>
                ))}
              </nav>
              <div className="lp-sheet-cta">
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                  {t('nav:landing.applyForMembership')}
                </Link>
                <Link href="/login" className="lp-btn lp-btn-outline lp-btn-lg">
                  {t('nav:landing.memberLogin')}
                </Link>
                {/* Repeated in the mobile sheet: on a phone the bar collapses and
                    this is the only reachable selector. */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <LanguageSelector variant="panel" align="start" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
