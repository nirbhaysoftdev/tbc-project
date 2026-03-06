'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '../../lib/sidebar';

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard' },
  { label: 'Portfolio',    href: '/portfolio' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Cards',        href: '/cards' },
  { label: 'Settings',     href: '/settings' },
];

export default function Topbar() {
  const pathname = usePathname();
  const { setOpen } = useSidebar();

  return (
    <header className="topbar">
      {/* Mobile hamburger — only visible on mobile */}
      <button className="topbar-hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Logo */}
      <div className="topbar-logo">
        <div className="topbar-logo-icon">
          <img src="/images/tbc-logo-1.png" alt="TBC Logo" />
        </div>
        <div>
          <span className="topbar-brand">TRILLION</span>
          <span className="topbar-sub">BUSINESS COMMUNITY</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="topbar-nav">
        {NAV_ITEMS.map(({ label, href }) => (
          <Link key={href} href={href}
            className={`topbar-nav-item ${pathname === href ? 'active' : ''}`}>
            {label}
          </Link>
        ))}
      </nav>

      {/* Actions */}
      <div className="topbar-actions">
        <button className="topbar-icon-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="topbar-icon-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
        </button>
        <button className="topbar-icon-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </button>
      </div>
    </header>
  );
}