'use client';
// src/components/landing/Nav.tsx

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'motion/react';
import { EASE, T, enter, useCalm } from './motion';

const LINKS = [
  { href: '#what', label: 'The community' },
  { href: '#advantages', label: 'Advantages' },
  { href: '#how-it-works', label: 'Opportunities' },
  { href: '#profit', label: 'Profits' },
  { href: '#faq', label: 'FAQ' },
];

export default function Nav() {
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
        <Link href="/" className="lp-nav-brand" aria-label="Trillion Business Community - home">
          <span className="lp-brand-mark">
            <img src="/images/tbc-logo-96.webp" alt="" width={60} height={60} />
          </span>
          <span className="lp-brand-text">
            <span className="lp-brand-name">TRILLION</span>
            <span className="lp-brand-sub">BUSINESS COMMUNITY</span>
          </span>
        </Link>

        <nav className="lp-nav-links" aria-label="Sections">
          {LINKS.map((l) => (
            <a href={l.href} key={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav-cta">
          <Link href="/login" className="lp-btn lp-btn-ghost">
            Member log in
          </Link>
          <Link href="/register" className="lp-btn lp-btn-primary">
            <span>Apply</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <button
            className="lp-nav-burger"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
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
            aria-label="Menu"
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
              <button className="lp-sheet-close" onClick={() => setOpen(false)} aria-label="Close menu">
                ✕
              </button>
              <nav className="lp-sheet-links">
                {LINKS.map((l) => (
                  <a href={l.href} key={l.href} onClick={() => setOpen(false)}>
                    {l.label}
                  </a>
                ))}
              </nav>
              <div className="lp-sheet-cta">
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                  Apply for membership
                </Link>
                <Link href="/login" className="lp-btn lp-btn-outline lp-btn-lg">
                  Member log in
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
