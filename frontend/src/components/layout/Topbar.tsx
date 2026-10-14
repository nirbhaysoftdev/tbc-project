'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '../../lib/sidebar';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { useAdminAlerts } from '@/lib/adminAlerts';
import NotifBadge from './NotifBadge';
import LanguageSelector from '@/components/i18n/LanguageSelector';

// `href` is the shared route and never changes with language; `key` is what
// gets translated. Switching language must not change the URL (§16).
const NAV_ITEMS = [
  { key: 'dashboard',    href: '/dashboard' },
  { key: 'portfolio',    href: '/portfolio' },
  { key: 'transactions', href: '/transactions' },
  { key: 'cards',        href: '/cards' },
  { key: 'settings',     href: '/settings' },
];

export default function Topbar() {
  const { t } = useTranslation(['nav', 'common']);
  const pathname = usePathname();
  const { setOpen } = useSidebar();
  const { alerts } = useAdminAlerts();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="topbar">
      {/* Mobile hamburger - only visible on mobile */}
      <button className="topbar-hamburger" onClick={() => setOpen(true)} aria-label={t('common:a11y.openNavigation')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Logo */}
      <div className="topbar-logo">
        <div className="topbar-logo-icon">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
        </div>
        <div>
          <span className="topbar-brand">{t('common:brand.name')}</span>
          <span className="topbar-sub">{t('common:brand.sub')}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="topbar-nav">
        {NAV_ITEMS.map(({ key, href }) => (
          <Link key={href} href={href}
            className={`topbar-nav-item ${pathname === href ? 'active' : ''}`}>
            {t(`nav:main.${key}`)}
          </Link>
        ))}
      </nav>

      {/* Actions */}
      <div className="topbar-actions">
        {/* Authenticated header selector (§4). Compact variant so it fits the
            narrow bar beside the icon buttons. */}
        <LanguageSelector variant="compact" />
{(() => {
          const bell = (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round"/>
              </svg>
              <NotifBadge count={alerts.total} className="notif-badge-float" />
            </>
          );
          const title = alerts.total > 0
            ? t('nav:alerts.summary', {
                members:     alerts.newMembers,
                investments: alerts.investmentRequests,
                withdrawals: alerts.withdrawRequests,
              })
            : t('nav:alerts.none');
          // Only admins have a queue to jump to, so only they get a link.
          return isAdmin
            ? <Link href="/admin" className="topbar-icon-btn" style={{ position: 'relative' }} title={title}>{bell}</Link>
            : <button className="topbar-icon-btn" style={{ position: 'relative' }} title={title}>{bell}</button>;
        })()}
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