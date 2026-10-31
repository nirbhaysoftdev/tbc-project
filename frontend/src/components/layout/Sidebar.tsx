'use client';
// src/components/layout/Sidebar.tsx
//
// The portal's one navigation. It is grouped rather than flat, and what it
// shows depends on who is looking.
//
// WHY IT IS GROUPED. A flat list of nine items with no headings makes the
// reader scan all nine every time, and it gave no place to put the admin
// sub-pages - so "Activity Logs" and "Withdrawal Req." sat beside "Community"
// as if they were peers. Sections name the job ("Wallet", "Explore",
// "Administration"), and the admin section's children are the admin panel's
// own tabs, linked by hash (/admin#pending), so the sidebar can reach a
// queue in one click instead of "open Admin, then find the tab".
//
// WHY THE TOPBAR HAS NO LINKS ANY MORE. It used to repeat Dashboard /
// Portfolio / Transactions / Cards / Settings, which are all here. Worse, it
// repeated them for ADMINS, who do not have those pages in this sidebar at
// all - so an admin could click "Portfolio" up there and land on a member page
// the sidebar says they do not have. One navigation, one answer.
//
// ROLE RULES, unchanged from before and still enforced by the API:
//  - an admin does not see the member wallet pages (Dashboard, Portfolio,
//    Cards): they have no wallet of their own to look at;
//  - Super Admin appears only for a SUPER_ADMIN - an admin seeing a link that
//    bounces them is worse than no link (src/lib/roles.ts).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocationHash } from '@/lib/useHashTab';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar';
import { useTranslation } from 'react-i18next';
import { useAdminAlerts } from '@/lib/adminAlerts';
import NotifBadge from './NotifBadge';
import { isAdminRole, isSuperAdminRole } from '@/lib/roles';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

type Item = {
  key: string;
  href: string;
  icon?: () => JSX.Element;
  /** Which alert count rides on this row, if any. */
  badge?: 'members' | 'investments' | 'withdrawals' | 'adminQueue';
  /** Super admin only. */
  superOnly?: boolean;
};

type Group = {
  key: string;
  /** Null for the opening group, which needs no heading. */
  label: string | null;
  items: Item[];
  /** Collapsible groups remember their state; the opening one is always open. */
  collapsible?: boolean;
};

/** Remembered per viewer, and never load-bearing: a failed read just means open. */
const COLLAPSE_KEY = 'tbc_nav_collapsed';

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function Sidebar() {
  const { t } = useTranslation(['nav', 'common', 'admin']);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  const { alerts } = useAdminAlerts();

  const isAdmin = isAdminRole(user?.role);
  const isSuper = isSuperAdminRole(user?.role);

  // The admin panel's current tab, for highlighting one of its children. Read
  // from the hash rather than useSearchParams, which would need a Suspense
  // boundary and breaks the static export. It comes from the same subscription
  // the panel itself uses, so the highlight follows the panel's own tabs as
  // well as these rows - see src/lib/useHashTab.ts for why a plain
  // `hashchange` listener here was not enough.
  const hash = useLocationHash();

  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => { setCollapsed(readCollapsed()); }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* per-viewer nicety */ }
      return next;
    });
  }, []);

  const groups: Group[] = isAdmin
    ? [
        {
          key: 'admin', label: t('nav:groups.administration', 'Administration'), collapsible: true,
          items: [
            { key: 'adminOverview',   href: '/admin#overview',   icon: OverviewIcon },
            { key: 'adminMembers',    href: '/admin#members',    icon: MembersIcon },
            { key: 'adminApprovals',  href: '/admin#pending',    icon: ApprovalIcon, badge: 'members' },
            { key: 'adminRequests',   href: '/admin#requests',   icon: InvestIcon,   badge: 'investments' },
            { key: 'withdrawalRequests', href: '/admin/withdrawals', icon: WithdrawIcon, badge: 'withdrawals' },
            { key: 'adminEnquiries',  href: '/admin#enquiries',  icon: EnquiryIcon },
            { key: 'adminBroadcasts', href: '/admin/broadcasts', icon: MailIcon },
            { key: 'adminAnalytics',  href: '/admin/analytics',  icon: AnalyticsIcon },
            { key: 'activityLogs',    href: '/admin/logs',       icon: LogsIcon },
            { key: 'superAdmin',      href: '/admin/super',      icon: SuperAdminIcon, superOnly: true },
          ],
        },
        {
          key: 'portfolioAdmin', label: t('nav:groups.portfolio', 'Portfolio'), collapsible: true,
          items: [
            { key: 'projects',  href: '/projects',  icon: ProjectsIcon },
            { key: 'companies', href: '/companies', icon: CompaniesIcon },
            { key: 'transactions', href: '/transactions', icon: TxIcon },
          ],
        },
        {
          key: 'communityAdmin', label: t('nav:groups.community', 'Community'), collapsible: true,
          items: [
            { key: 'community', href: '/community', icon: CommIcon },
            { key: 'settings',  href: '/settings',  icon: SettingsIcon },
          ],
        },
      ]
    : [
        {
          key: 'wallet', label: null,
          items: [
            { key: 'dashboard',    href: '/dashboard',    icon: DashIcon },
            { key: 'portfolio',    href: '/portfolio',    icon: PortfolioIcon },
            { key: 'transactions', href: '/transactions', icon: TxIcon },
            { key: 'cards',        href: '/cards',        icon: CardIcon },
          ],
        },
        {
          key: 'explore', label: t('nav:groups.explore', 'Explore'), collapsible: true,
          items: [
            { key: 'community', href: '/community', icon: CommIcon },
            { key: 'projects',  href: '/projects',  icon: ProjectsIcon },
            { key: 'companies', href: '/companies', icon: CompaniesIcon },
          ],
        },
        {
          key: 'account', label: t('nav:groups.account', 'Account'), collapsible: true,
          items: [
            { key: 'settings', href: '/settings', icon: SettingsIcon },
          ],
        },
      ];

  const badgeFor = (badge: Item['badge']) => {
    switch (badge) {
      case 'members':     return alerts.newMembers;
      case 'investments': return alerts.investmentRequests;
      case 'withdrawals': return alerts.withdrawRequests;
      case 'adminQueue':  return alerts.newMembers + alerts.investmentRequests;
      default:            return 0;
    }
  };

  // This portal is a static export, so Next serves '/admin/' - with the
  // trailing slash - while the hrefs here are written without one. Comparing
  // them raw means no row is ever exactly equal to the current route and
  // nothing ever highlights.
  const normalise = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const here = normalise(pathname || '/');

  /** Active when the route matches - and, for a hashed link, the tab as well. */
  const isActive = (href: string) => {
    const [rawPath, tab] = href.split('#');
    const path = normalise(rawPath);
    if (tab) {
      // '/admin#overview' is also the active row when there is no hash at all,
      // because that is the tab the page opens on.
      return here === path && (hash === tab || (!hash && tab === 'overview'));
    }
    // An exact match, or a child route: /projects/detail keeps Projects lit.
    return here === path || here.startsWith(`${path}/`);
  };

  /** A group is "live" when one of its rows is - it is never collapsed shut on top of the current page. */
  const groupIsLive = (group: Group) => group.items.some((i) => {
    const path = normalise(i.href.split('#')[0]);
    return here === path || here.startsWith(`${path}/`);
  });

  const initial  = user?.name?.charAt(0).toUpperCase() || '?';
  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Compact: avatar beside the name rather than above it. The identity
          block is a label, not the point of the screen - every pixel it gives
          back is a nav row that does not need scrolling to. */}
      <div className="sidebar-profile">
        <div className="sidebar-avatar">
          {photoUrl
            ? <img src={photoUrl} alt={user?.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : initial}
        </div>
        <div className="sidebar-identity">
          <p className="sidebar-username" title={user?.name}>{user?.name}</p>
          {isAdmin && (
            <span className="sidebar-role">
              {isSuper ? t('nav:role.superAdmin', 'Super admin') : t('nav:role.admin', 'Admin')}
            </span>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => {
          const shut = Boolean(group.collapsible)
            && collapsed.includes(group.key)
            && !groupIsLive(group);
          const items = group.items.filter((i) => !i.superOnly || isSuper);
          // The count that stays visible when a group is folded away, so a
          // collapsed section can never hide a queue.
          const hidden = shut ? items.reduce((sum, i) => sum + badgeFor(i.badge), 0) : 0;

          return (
            <div className="nav-group" key={group.key}>
              {group.label && (
                <button type="button" className="nav-group-head"
                  aria-expanded={!shut}
                  onClick={() => group.collapsible && toggleGroup(group.key)}>
                  <span className="nav-group-label">{group.label}</span>
                  {hidden > 0 && <NotifBadge count={hidden} />}
                  <ChevronIcon open={!shut} />
                </button>
              )}

              {!shut && items.map((item) => {
                const Icon = item.icon;
                const count = badgeFor(item.badge);
                return (
                  <Link key={item.href} href={item.href} onClick={onNav}
                    className={`nav-item ${isActive(item.href) ? 'active' : ''}`}>
                    {Icon ? <Icon /> : null}
                    <span>{t(`nav:main.${item.key}`)}</span>
                    {count > 0 && <NotifBadge count={count} style={{ marginInlineStart: 'auto' }} />}
                  </Link>
                );
              })}
            </div>
          );
        })}
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`nav-chevron ${open ? 'is-open' : ''}`} viewBox="0 0 24 24"
      width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
      aria-hidden="true">
      <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
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

/** The Overview: a small bar chart, which is what the page is. */
function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 21h18" strokeLinecap="round"/>
      <rect x="5" y="12" width="3.4" height="6" rx="1"/>
      <rect x="10.3" y="8" width="3.4" height="10" rx="1"/>
      <rect x="15.6" y="4" width="3.4" height="14" rx="1"/>
    </svg>
  );
}
function MembersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="8" r="3.2"/>
      <path d="M3.5 20v-1.6A4.4 4.4 0 0 1 7.9 14h2.2a4.4 4.4 0 0 1 4.4 4.4V20"/>
      <path d="M16.5 14.2A4 4 0 0 1 20.5 18v2" strokeLinecap="round"/>
      <path d="M15.5 5.3a3.2 3.2 0 0 1 0 5.4" strokeLinecap="round"/>
    </svg>
  );
}
/** Approvals: a person with a tick. */
function ApprovalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="8" r="3.2"/>
      <path d="M4 20v-1.6A4.4 4.4 0 0 1 8.4 14h2.6"/>
      <path d="M14.5 17.5l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function InvestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18l5-5 3.5 3.5L20 9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 9h5v5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function EnquiryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
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
function AnalyticsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19V5M4 19h16" strokeLinecap="round"/>
      <path d="M8 15l3-4 3 2 5-6" strokeLinecap="round" strokeLinejoin="round"/>
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
