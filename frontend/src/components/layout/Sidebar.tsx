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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar';
import { useTranslation } from 'react-i18next';
import { useAdminAlerts } from '@/lib/adminAlerts';
import NotifBadge from './NotifBadge';
import { messagesAPI } from '@/lib/api';
import { isAdminRole, isSuperAdminRole } from '@/lib/roles';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

type Item = {
  key: string;
  href: string;
  icon?: () => JSX.Element;
  /** Which alert count rides on this row, if any. */
  badge?: 'members' | 'investments' | 'withdrawals' | 'adminQueue' | 'messages';
  /** Super admin only. */
  superOnly?: boolean;
};

type Group = {
  key: string;
  /** Null for the opening group, which needs no heading. */
  label: string | null;
  items: Item[];
  /** Collapsible groups stay shut unless they hold the current page; the opening one is always open. */
  collapsible?: boolean;
};

/** How long a group the viewer opened by hand stays open before it folds itself away. */
const AUTO_CLOSE_MS = 6000;

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

  // Sections are shut by default and only the one holding the current page is
  // open. Opening another by hand is temporary: it folds itself away after
  // AUTO_CLOSE_MS, so the sidebar settles back to "where you are".
  // Unread messages ride on the Messages row, since it moved here from the
  // community sub-nav, which used to carry the count.
  const [unreadMsg, setUnreadMsg] = useState(0);
  useEffect(() => {
    const load = () => { messagesAPI.getUnreadCount().then((r) => setUnreadMsg(r.data.unreadCount || 0)).catch(() => {}); };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const [opened, setOpened] = useState<string[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = (key: string) => {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
  };

  const toggleGroup = useCallback((key: string) => {
    setOpened((prev) => {
      if (prev.includes(key)) { clearTimer(key); return prev.filter((k) => k !== key); }
      clearTimer(key);
      timers.current[key] = setTimeout(() => {
        setOpened((cur) => cur.filter((k) => k !== key));
        delete timers.current[key];
      }, AUTO_CLOSE_MS);
      return [...prev, key];
    });
  }, []);

  useEffect(() => () => { Object.keys(timers.current).forEach(clearTimer); }, []);

  const groups: Group[] = isAdmin
    ? [
        {
          key: 'admin', label: t('nav:groups.administration', 'Administration'), collapsible: true,
          items: [
            // Members, Approvals, Investment Requests and Enquiries are tabs of
            // the panel itself, one click from here - so their queue counts ride
            // on this row instead of being repeated as four more.
            { key: 'adminOverview',   href: '/admin#overview',   icon: OverviewIcon, badge: 'adminQueue' },
            { key: 'withdrawalRequests', href: '/admin/withdrawals', icon: WithdrawIcon, badge: 'withdrawals' },
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
            { key: 'dealRoom',  href: '/community/deal-room', icon: DealRoomIcon },
            { key: 'events',    href: '/community/events',    icon: EventsIcon },
            { key: 'messages',  href: '/community/messages',  icon: MessagesIcon, badge: 'messages' },
            { key: 'news',      href: '/news',      icon: NewsIcon },
          ],
        },
      ]
    : [
        // A member has few enough destinations that one list, with no headings
        // to open and close, is quicker than sections.
        {
          key: 'member', label: null,
          items: [
            { key: 'dashboard',    href: '/dashboard',    icon: DashIcon },
            { key: 'transactions', href: '/transactions', icon: TxIcon },
            { key: 'cards',        href: '/cards',        icon: CardIcon },
            { key: 'community', href: '/community', icon: CommIcon },
            { key: 'dealRoom',  href: '/community/deal-room', icon: DealRoomIcon },
            { key: 'events',    href: '/community/events',    icon: EventsIcon },
            { key: 'messages',  href: '/community/messages',  icon: MessagesIcon, badge: 'messages' },
            { key: 'projects',  href: '/projects',  icon: ProjectsIcon },
            { key: 'companies', href: '/companies', icon: CompaniesIcon },
            { key: 'news',      href: '/news',      icon: NewsIcon },
          ],
        },
      ];

  const badgeFor = (badge: Item['badge']) => {
    switch (badge) {
      case 'members':     return alerts.newMembers;
      case 'investments': return alerts.investmentRequests;
      case 'withdrawals': return alerts.withdrawRequests;
      case 'adminQueue':  return alerts.newMembers + alerts.investmentRequests;
      case 'messages':    return unreadMsg;
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
      // The Overview row stands for the whole panel now that Members, Approvals,
      // Requests and Enquiries are its tabs, so it is lit on every one of them.
      if (path === '/admin' && tab === 'overview') return here === path;
      return here === path && (hash === tab || (!hash && tab === 'overview'));
    }
    // The Community row is the feed and the member directory only: Deal Room,
    // Events and Messages are /community/* too, but have rows of their own.
    if (path === '/community') return here === path || here.startsWith('/community/network');
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
        {/* Settings has no row of its own: the avatar is the way in. */}
        <Link href="/settings" onClick={onNav} className={`sidebar-avatar ${here === '/settings' ? 'is-current' : ''}`}
          title={t('nav:main.settings')} aria-label={t('nav:main.settings')}>
          {photoUrl
            ? <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : initial}
        </Link>
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
            && !groupIsLive(group)
            && !opened.includes(group.key);
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
        <button type="button" className="sidebar-logout" onClick={() => { logout(); onNav?.(); }}>
          {/* The standard "log out" glyph: a door frame with an arrow leaving it. */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>{t('common:action.logOut')}</span>
        </button>
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

function EventsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round"/>
      <path d="M8 14h2M12 14h2M8 17.5h2" strokeLinecap="round"/>
    </svg>
  );
}
function DealRoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="18" height="13" rx="2"/>
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" strokeLinecap="round"/>
      <path d="M11 13v2h2v-2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function MessagesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round"/>
      <path d="M8.5 11h7M8.5 14h4" strokeLinecap="round"/>
    </svg>
  );
}
function CommIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function DashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3" strokeLinecap="round"/></svg>;
}
function TxIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
}
function CardIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h2"/></svg>;
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
function NewsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 5h13a1 1 0 011 1v13H6a2 2 0 01-2-2V5z" strokeLinejoin="round"/>
      <path d="M18 9h2v8a2 2 0 01-2 2" strokeLinecap="round"/>
      <path d="M8 9h6M8 13h6M8 16h3" strokeLinecap="round"/>
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
