'use client';
// src/components/community/CommunityNav.tsx
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { messagesAPI, communityAPI } from '@/lib/api';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

const NAV_LINKS = [
  { href: '/community',          label: 'Feed' },
  { href: '/community/deal-room', label: 'Deal Room' },
  { href: '/community/network',   label: 'Community' },
  { href: '/community/events',    label: 'Events' },
  { href: '/community/messages',  label: 'Messages', countKey: 'msg' },
];

export default function CommunityNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuth();

  const [unreadMsg,   setUnreadMsg]   = useState(0);
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [menuOpen,    setMenuOpen]    = useState(false);

  const initial  = user?.name?.charAt(0).toUpperCase() || '?';
  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  useEffect(() => {
    const fetchCounts = () => {
      messagesAPI.getUnreadCount().then(r => setUnreadMsg(r.data.unreadCount)).catch(() => {});
      communityAPI.getNotifications().then(r => setUnreadNotif(r.data.unreadCount)).catch(() => {});
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  const tierLabel = (tier?: string) => {
    const map: Record<string, string> = {
      BASIC: 'Basic', PREMIUM: 'Premium', ENTERPRISE: 'Enterprise', ELITE: 'Elite',
    };
    return tier ? map[tier] || tier : 'Basic';
  };

  return (
    <nav className="comm-nav">
      {/* Logo */}
      <Link href="/community" className="comm-nav-logo">
        <img src="/images/tbc-logo-1.png" alt="TBC" className="comm-nav-logo-img" />
        <div>
          <div className="comm-nav-brand-name">TRILLION</div>
          <div className="comm-nav-brand-sub">Business Community</div>
        </div>
      </Link>

      {/* Center nav links */}
      <div className="comm-nav-links">
        {NAV_LINKS.map(({ href, label, countKey }) => {
          const isActive = href === '/community'
            ? pathname === '/community'
            : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`comm-nav-link${isActive ? ' active' : ''}`}>
              {label}
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
        {/* Notifications bell */}
        <Link href="/community/notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadNotif > 0 && <span className="comm-notif-dot" />}
        </Link>

        {/* Wallet shortcut (only if user has wallet) */}
        {user?.wallet && (
          <Link href="/dashboard" style={{
            fontSize: 11, fontWeight: 600, color: 'var(--gold)',
            padding: '5px 10px', border: '1px solid rgba(200,168,75,0.3)',
            borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap',
          }}>
            SalBank
          </Link>
        )}

        {/* Avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <div className="comm-nav-avatar" onClick={() => setMenuOpen(o => !o)}>
            {photoUrl ? <img src={photoUrl} alt={user?.name} /> : initial}
          </div>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 44, width: 200,
              background: '#0e1529', border: '1px solid var(--border)',
              borderRadius: 12, padding: '8px 0', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 200,
            }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tierLabel(user?.membershipTier)} Member
                </div>
              </div>
              {[
                { label: 'My Profile',  href: '/settings' },
                { label: 'Settings',    href: '/settings' },
                ...(user?.wallet ? [{ label: 'Wallet (SalBank)', href: '/dashboard' }] : []),
                ...(user?.role === 'ADMIN' ? [{ label: 'Admin Panel', href: '/admin' }] : []),
              ].map(item => (
                <div key={item.href}
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
                Log Out
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
