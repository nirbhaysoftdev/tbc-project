'use client';
// src/components/community/CommunityNav.tsx
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { messagesAPI } from '@/lib/api';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { isAdminRole } from '@/lib/roles';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

const NAV_LINKS = [
  { href: '/community',           key: 'feed' },
  { href: '/community/deal-room', key: 'dealRoom' },
  { href: '/community/network',   key: 'directory' },
  { href: '/community/events',    key: 'events' },
  { href: '/community/messages',  key: 'messages', countKey: 'msg' },
];

export default function CommunityNav({
  variant = 'full',
}: {
  /**
   * 'full'   — the standalone bar, with branding, language, wallet and the
   *            account menu. Kept for any page that renders outside the app
   *            shell.
   * 'subnav' — just the five community sections, as a secondary strip beneath
   *            the topbar. Used inside the app shell, where the sidebar and
   *            topbar already carry identity and log-out.
   */
  variant?: 'full' | 'subnav';
} = {}) {
  const { t } = useTranslation(['nav', 'common']);
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuth();

  const [unreadMsg,   setUnreadMsg]   = useState(0);
  const [menuOpen,    setMenuOpen]    = useState(false);

  const initial  = user?.name?.charAt(0).toUpperCase() || '?';
  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  useEffect(() => {
    const fetchCounts = () => {
      messagesAPI.getUnreadCount().then(r => setUnreadMsg(r.data.unreadCount)).catch(() => {});
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  if (variant === 'subnav') {
    return (
      <nav className="comm-subnav" aria-label={t('nav:community.feed')}>
        {NAV_LINKS.map(({ href, key, countKey }) => {
          const isActive = href === '/community'
            ? pathname === '/community'
            : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`comm-subnav-link${isActive ? ' active' : ''}`}>
              {t(`nav:community.${key}`)}
              {countKey === 'msg' && unreadMsg > 0 && (
                <span className="comm-subnav-count">{unreadMsg}</span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="comm-nav">
      {/* Logo */}
      <Link href="/community" className="comm-nav-logo">
        <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} className="comm-nav-logo-img" />
        <div>
          <div className="comm-nav-brand-name">{t('common:brand.name')}</div>
          <div className="comm-nav-brand-sub">{t('common:brand.subTitle')}</div>
        </div>
      </Link>

      {/* Center nav links */}
      <div className="comm-nav-links">
        {NAV_LINKS.map(({ href, key, countKey }) => {
          const isActive = href === '/community'
            ? pathname === '/community'
            : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`comm-nav-link${isActive ? ' active' : ''}`}>
              {t(`nav:community.${key}`)}
              {countKey === 'msg' && unreadMsg > 0 && (
                <span style={{
                  background: 'var(--red)', color: '#fff', borderRadius: '50%',
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4,
                }}>
                  {unreadMsg}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div className="comm-nav-right">
        {/* Shared community navigation entry point (§4). */}
        <LanguageSelector variant="bar" />
        {/* Wallet shortcut (only if user has wallet) */}
        {user?.wallet && (
          <Link href="/dashboard" style={{
            fontSize: 11, fontWeight: 600, color: 'var(--gold)',
            padding: '5px 10px', border: '1px solid rgba(200,168,75,0.3)',
            borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap',
          }}>
            {t('common:brand.wallet')}
          </Link>
        )}

        {/* Avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <div className="comm-nav-avatar" onClick={() => setMenuOpen(o => !o)}>
            {photoUrl ? <img src={photoUrl} alt={user?.name} /> : initial}
          </div>

          {menuOpen && (
            <div style={{
              // insetInlineEnd rather than right: the menu hangs off the end of
              // the avatar in both directions (§10).
              position: 'absolute', insetInlineEnd: 0, top: 44, width: 200,
              background: '#0e1529', border: '1px solid var(--border)',
              borderRadius: 12, padding: '8px 0', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 200,
            }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {isAdminRole(user?.role) ? t('common:role.admin') : t('common:role.member')}
                </div>
              </div>
              {[
                { label: t('nav:main.myProfile'),  href: '/settings', id: 'profile' },
                { label: t('nav:main.settings'),   href: '/settings', id: 'settings' },
                ...(user?.wallet ? [{ label: t('nav:main.walletShort'), href: '/dashboard', id: 'wallet' }] : []),
                ...(isAdminRole(user?.role) ? [{ label: t('nav:main.adminPanel'), href: '/admin', id: 'admin' }] : []),
              ].map(item => (
                // Keyed by `id`, not href: two entries share /settings, and a
                // translated label is not a stable React key.
                <div key={item.id}
                  style={{ padding: '9px 16px', fontSize: 13, color: 'var(--text-secondary)',
                           cursor: 'pointer', transition: 'color 0.2s' }}
                  onClick={() => { router.push(item.href); setMenuOpen(false); }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  {item.label}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div
                style={{ padding: '9px 16px', fontSize: 13, color: 'var(--red)', cursor: 'pointer' }}
                onClick={() => { logout(); setMenuOpen(false); }}
              >
                {t('common:action.logOut')}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
