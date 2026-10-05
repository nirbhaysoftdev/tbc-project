'use client';
// src/components/landing/Footer.tsx

import Link from 'next/link';
import { Reveal } from './motion';

export default function Footer() {
  return (
    <footer className="lp-footer">
      <Reveal className="lp-footer-top" amount={0.1}>
        <div className="lp-footer-col lp-footer-col-brand">
          <div className="lp-footer-brand">
            <img src="/images/tbc-logo-96.webp" alt="" width={56} height={56} />
            <div>
              <div className="lp-brand-name">TRILLION BUSINESS COMMUNITY</div>
              <div className="lp-footer-tag">Members · Opportunities · Growth</div>
            </div>
          </div>
          <p className="lp-footer-desc">
            A private business community where owners, operators and investors from twelve industries
            discover opportunities and build them together.
          </p>
          <div className="lp-socials">
            {/* <a href="#" aria-label="Facebook" className="lp-social">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.5v1.8h2.6l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z"/></svg>
            </a>
            <a href="#" aria-label="LinkedIn" className="lp-social">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3v9zM6.5 8.3a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5zM19 19h-3v-4.7c0-1.1-.4-1.9-1.4-1.9-.8 0-1.3.5-1.5 1-.1.2-.1.5-.1.7V19h-3s0-8.2 0-9h3v1.3c.4-.6 1.1-1.5 2.7-1.5 2 0 3.3 1.3 3.3 4V19z"/></svg>
            </a> */}
            <a href="#" aria-label="Instagram" className="lp-social">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
            </a>
          </div>
        </div>

        <div className="lp-footer-col">
          <div className="lp-footer-heading">The community</div>
          <ul className="lp-footer-links">
            <li><a href="#what">What it is</a></li>
            <li><a href="#why">Why join</a></li>
            <li><a href="#how-it-works">How it works</a></li>
            <li><a href="#what">Why we exist</a></li>
          </ul>
        </div>

        <div className="lp-footer-col">
          <div className="lp-footer-heading">Membership</div>
          <ul className="lp-footer-links">
            <li><Link href="/register">Apply for membership</Link></li>
            <li><Link href="/login">Member log in</Link></li>
            <li><a href="#community">Industries</a></li>
            <li><a href="#partners">Partners</a></li>
          </ul>
        </div>

        <div className="lp-footer-col">
          <div className="lp-footer-heading">Contact</div>
          <ul className="lp-footer-links">
            <li><a href="mailto:info@trillionbusinesscommunity.com">info@trillionbusinesscommunity.com</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </div>
      </Reveal>

      <div className="lp-footer-bottom">
        <span>© {new Date().getFullYear()} All rights reserved · Trillion Business Community</span>
        <a
          href="https://jocorporateholding.com"
          target="_blank"
          rel="noopener noreferrer"
          className="lp-footer-powered"
        >
          Powered by
          <img src="/images/jocorporate-logo.png" alt="Jo Corporate" width={20} height={20} />
          <span>Jo Corporate</span>
        </a>
      </div>
    </footer>
  );
}
