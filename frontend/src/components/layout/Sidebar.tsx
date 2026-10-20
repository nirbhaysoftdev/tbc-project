'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar';
import { useTranslation } from 'react-i18next';
import { useAdminAlerts } from '@/lib/adminAlerts';
import NotifBadge from './NotifBadge';
import { isAdminRole, isSuperAdminRole } from '@/lib/roles';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

const NAV_ITEMS = [
  { key: 'community',    href: '/community',    icon: CommIcon },
  { key: 'dashboard',    href: '/dashboard',    icon: DashIcon },
  { key: 'projects',     href: '/projects',     icon: ProjectsIcon },
  { key: 'companies',    href: '/companies',    icon: CompaniesIcon },
  { key: 'portfolio',    href: '/portfolio',    icon: PortfolioIcon },
  { key: 'transactions', href: '/transactions', icon: TxIcon },
  { key: 'cards',        href: '/cards',        icon: CardIcon },
  { key: 'settings',     href: '/settings',     icon: SettingsIcon },
];

export default function Sidebar() {
  const { t } = useTranslation(['nav', 'common']);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const { alerts } = useAdminAlerts();

  const initial  = user?.name?.charAt(0).toUpperCase() || '?';
  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="sidebar-profile">
        <div className="sidebar-avatar">
          {photoUrl
            ? <img src={photoUrl} alt={user?.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : initial}
        </div>
        <p className="sidebar-username">{user?.name}</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS
  .filter(item => {
    if (isAdminRole(user?.role)) {
      // hide wallet-only member pages
      return !['/dashboard', '/portfolio', '/cards'].includes(item.href);
    }
    return true;
  })
  .map(({ key, href, icon: Icon }) => (
    <Link key={href} href={href} onClick={onNav}
      className={`nav-item ${pathname === href || pathname.startsWith(`${href}/`) ? 'active' : ''}`}>
      <Icon />
      <span>{t(`nav:main.${key}`)}</span>
    </Link>
))}
        {isAdminRole(user?.role) && (
         
          <>
    <Link href="/admin" onClick={onNav}
      className={`nav-item ${pathname.startsWith('/admin') && !pathname.includes('withdrawal') && !pathname.startsWith('/admin/logs') ? 'active' : ''}`}>
      <AdminIcon />
      <span>{t('nav:main.adminPanel')}</span>
      <NotifBadge
        count={alerts.newMembers + alerts.investmentRequests}
        title={t('nav:alerts.adminQueue', {
          members:     alerts.newMembers,
          investments: alerts.investmentRequests,
        })}
        // marginInlineStart, not marginLeft: the badge must sit at the end of
        // the row in both directions (§10).
        style={{ marginInlineStart: 'auto' }}
      />
    </Link>
    <Link href="/admin/logs" onClick={onNav}
      className={`nav-item ${pathname.startsWith('/admin/logs') ? 'active' : ''}`}>
      <LogsIcon />
      <span>{t('nav:main.activityLogs')}</span>
    </Link>
    <Link href="/admin/withdrawals" onClick={onNav}
      className={`nav-item ${pathname.includes('withdrawal') ? 'active' : ''}`}>
      <WithdrawIcon />
      <span>{t('nav:main.withdrawalRequests')}</span>
      <NotifBadge
        count={alerts.withdrawRequests}
        title={t('nav:alerts.withdrawalQueue', { count: alerts.withdrawRequests })}
        style={{ marginInlineStart: 'auto' }}
      />
    </Link>
    {/* The privileged panel. Shown only to a super admin — an admin seeing a
        link to a page that bounces them is a worse experience than no link. */}
    {isSuperAdminRole(user?.role) && (
      <Link href="/admin/super" onClick={onNav}
        className={`nav-item ${pathname.startsWith('/admin/super') ? 'active' : ''}`}>
        <SuperAdminIcon />
        <span>{t('nav:main.superAdmin', 'Super Admin')}</span>
      </Link>
    )}
  </>
          
        )}
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-email">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/></svg>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.email}
          </span>
        </p>
        <p className="sidebar-logout" onClick={() => { logout(); onNav?.(); }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="#e05252" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/></svg>
          {t('common:action.logOut')}
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <aside className="sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile fullscreen overlay - toggled from Topbar */}
      {open && (
        <div className="mobile-overlay" onClick={() => setOpen(false)}>
          <div className="mobile-panel" onClick={e => e.stopPropagation()}>
            <button className="mobile-close" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6"  x2="6"  y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarContent onNav={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function CommIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function DashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3" strokeLinecap="round"/></svg>;
}
function PortfolioIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
function TxIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
}
function CardIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h2"/></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
function AdminIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}

// The admin shield with a key through it: the same family, one tier up.
function SuperAdminIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <circle cx="12" cy="10" r="2.2"/>
      <path d="M12 12.2V16" strokeLinecap="round"/>
    </svg>
  );
}

function CompaniesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 21h18"/>
      <rect x="4" y="8" width="7" height="13" rx="1"/>
      <rect x="13" y="3" width="7" height="18" rx="1"/>
      <path d="M7 12h1M7 16h1M16 7h1M16 11h1M16 15h1" strokeLinecap="round"/>
    </svg>
  );
}
function ProjectsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="6" rx="1"/>
      <rect x="3" y="14" width="12" height="6" rx="1"/>
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h16v16H4z"/>
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round"/>
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 5v14M5 12l7-7 7 7"/>
      <rect x="3" y="18" width="18" height="3" rx="1"/>
    </svg>
  );
}