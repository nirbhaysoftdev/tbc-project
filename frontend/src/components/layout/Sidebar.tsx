'use client';
// src/components/layout/Sidebar.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4000';

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',    icon: DashIcon },
  { label: 'Portfolio',    href: '/portfolio',    icon: PortfolioIcon },
  { label: 'Transactions', href: '/transactions', icon: TxIcon },
  { label: 'Cards',        href: '/cards',        icon: CardIcon },
  { label: 'Settings',     href: '/settings',     icon: SettingsIcon },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const initial = user?.name?.charAt(0).toUpperCase() || '?';
  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  return (
    <aside className="sidebar">
      {/* Profile */}
      <div className="sidebar-profile">
        <div className="sidebar-avatar">
          {photoUrl ? <img src={photoUrl} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
        </div>
        <p className="sidebar-username">{user?.name}</p>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}
            className={`nav-item ${pathname === href ? 'active' : ''}`}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
        {user?.role === 'ADMIN' && (
          <Link href="/admin"
            className={`nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`}>
            <AdminIcon />
            <span>Admin Panel</span>
          </Link>
        )}
      </nav>

      {/* Add Funds */}
      <button className="sidebar-add-funds">Add Funds</button>

      {/* Footer */}
      <div className="sidebar-footer">
        <p className="sidebar-email">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9"/>
          </svg>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.email}
          </span>
        </p>
        <p className="sidebar-logout" onClick={logout}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="#e05252" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/></svg>
          Log Out
        </p>
      </div>
    </aside>
  );
}

// ── Icons ──────────────────────────────────────
function DashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4l3 3" strokeLinecap="round"/>
    </svg>
  );
}
function PortfolioIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}
function TxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>
  );
}
function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20M6 15h2"/>
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}
