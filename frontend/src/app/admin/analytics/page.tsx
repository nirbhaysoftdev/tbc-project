'use client';
// src/app/admin/analytics/page.tsx
//
// Analytics & Monitoring: live visitors, traffic, geography, sign-in activity
// and per-member history, for ADMIN and SUPER_ADMIN. Read-only throughout - the
// API refuses every write method on this module, and nothing on this page
// edits, deletes or manages an account.
//
// Its own route (like Activity Logs) with the seven sections as hash tabs, so
// Back steps between them and a pasted link opens where the sender meant.
import { useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';
import { useHashTab } from '@/lib/useHashTab';
import { Filters, DEFAULT_FILTERS, FilterBar, useDebounced } from '@/components/admin/monitoring/shared';
import {
  OverviewSection, LiveSection, LandingSection, GeoSection, AuthSection, ActivitySection, TrafficSection, ReportsSection,
} from '@/components/admin/monitoring/Sections';

const TABS = [
  ['overview', 'Overview Dashboard', 'Live KPIs and traffic overview'],
  ['live', 'Live Visitors & Users', 'Current visitors and logged-in sessions'],
  ['landing', 'Landing Page', 'Visits, sources and applications'],
  ['geo', 'Geographic Analytics', 'Country, city and IP insights'],
  ['auth', 'Login & Registration', 'Authentication statistics and history'],
  ['activity', 'User Activity History', 'Individual user timelines'],
  ['traffic', 'Traffic & Engagement', 'Page views, sessions and conversions'],
  ['reports', 'Reports & Exports', 'Historical reports and downloads'],
] as const;
type Tab = typeof TABS[number][0];
const TAB_KEYS = TABS.map((t) => t[0]) as readonly Tab[];

function AnalyticsContent() {
  const { user } = useAuth();
  const isSuper = isSuperAdminRole(user?.role);
  const [tab, setTab] = useHashTab<Tab>(TAB_KEYS, 'overview');
  const [raw, setRaw] = useState<Filters>(DEFAULT_FILTERS);
  // Typing in the search or IP box must not fire a request per keystroke.
  const filters = useDebounced(raw, 350);
  const [openUser, setOpenUser] = useState('');

  const openHistory = (id: string) => { setOpenUser(id); if (id && tab !== 'activity') setTab('activity'); };
  const current = TABS.find((t) => t[0] === tab)!;

  return (
    <div className="content-left">
      <div className="mn-head">
        <div>
          <h1 className="page-title">Analytics &amp; Monitoring</h1>
          <p className="mn-lead">{current[2]}. Read-only.{!isSuper && ' IP addresses are partly masked for Admin accounts.'}</p>
        </div>
      </div>

      <nav className="mn-tabs" aria-label="Analytics sections">
        {TABS.map(([key, label, desc]) => (
          <button key={key} type="button" title={desc} className={`mn-tab ${tab === key ? 'is-on' : ''}`}
            aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {/* Session status only means something where individual sessions are
          listed; the aggregates would silently ignore it. */}
      <FilterBar filters={raw} onChange={setRaw} isSuper={isSuper}
        hideRange={tab === 'live'} hideStatus={tab !== 'activity' && tab !== 'reports'} />

      {tab === 'overview' && <OverviewSection filters={filters} />}
      {tab === 'live'     && <LiveSection filters={filters} onUser={openHistory} />}
      {tab === 'landing'  && <LandingSection filters={filters} />}
      {tab === 'geo'      && <GeoSection filters={filters} />}
      {tab === 'auth'     && <AuthSection filters={filters} onUser={openHistory} />}
      {tab === 'activity' && <ActivitySection filters={filters} open={openUser} onOpen={setOpenUser} />}
      {tab === 'traffic'  && <TrafficSection filters={filters} />}
      {tab === 'reports'  && <ReportsSection filters={filters} isSuper={isSuper} />}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <ProtectedLayout requireAdmin>
      <AnalyticsContent />
    </ProtectedLayout>
  );
}
