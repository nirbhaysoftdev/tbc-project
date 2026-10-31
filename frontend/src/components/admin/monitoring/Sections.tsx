'use client';
// src/components/admin/monitoring/Sections.tsx
//
// The seven sections of Analytics & Monitoring. Each takes the shared filters
// and only reads: nothing here has a button that changes a member or a session.
import { useEffect, useState } from 'react';
import { monitoringAPI, formatDateTime, formatNumber, downloadBlob } from '@/lib/api';
import { SERIES } from '@/lib/viz';
import {
  Filters, toParams, Kpi, Card, Pager, Bars, TimeChart, Who, ErrorNote, fmtDuration, fmtPct, fmtAgo, useDebounced, filtersReady,
} from './shared';
import { useMonitoring, useLiveBoard, LiveSession } from './useData';

const n = (v: number) => formatNumber(v);
const RANGE_NAME: Record<string, string> = { today: 'today', '7d': 'the last 7 days', '30d': 'the last 30 days', '90d': 'the last 90 days', custom: 'the selected dates' };
const PendingRange = () => <div className="an-note">Pick a start and end date to load a custom period.</div>;

// ── 1. Overview ───────────────────────────────

export function OverviewSection({ filters }: { filters: Filters }) {
  const { data, loading, error } = useMonitoring<any>(monitoringAPI.overview, filters);
  const live = useLiveBoard({ ...filters, status: '' });
  if (!filtersReady(filters)) return <PendingRange />;
  const k = data?.kpis; const period = RANGE_NAME[filters.range];
  const liveCounts = live.board?.counts || data?.live;

  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="an-kpis">
        <Kpi label="Live visitors" live value={n(liveCounts?.total ?? 0)} sub={`${n(liveCounts?.guests ?? 0)} guests browsing`} />
        <Kpi label="Active logged-in users" value={n(liveCounts?.members ?? 0)} sub="Authenticated sessions" accent={SERIES[2]} />
        <Kpi label="Total landing page visits" value={n(k?.landingVisits ?? 0)} sub={`In ${period}`} />
        <Kpi label="Total registered users" value={n(k?.totalRegisteredUsers ?? 0)} sub="All registered accounts" />
        <Kpi label="New registrations" value={n(k?.registrations ?? 0)} sub={`In ${period}`} />
        <Kpi label="Unique visitors" value={n(k?.visitors ?? 0)} sub={`${n(k?.newVisitors ?? 0)} new · ${n(k?.returningVisitors ?? 0)} returning`} />
        <Kpi label="Page views" value={n(k?.pageViews ?? 0)} sub={`${n(k?.sessions ?? 0)} sessions`} />
        <Kpi label="Avg. session duration" value={fmtDuration(k?.avgSessionSeconds ?? 0)} sub={`${fmtPct(k?.bounceRate ?? 0)} bounce rate`} />
      </div>

      <Card title="Portal traffic overview" sub={`Daily visitors and logged-in users, ${period}`}>
        {data ? <TimeChart points={data.series} granularity={data.range.granularity}
          series={[{ key: 'visitors', label: 'Visitors', color: SERIES[0] }, { key: 'users', label: 'Logged-in users', color: SERIES[2] }]} />
          : <p className="an-empty">{loading ? 'Loading…' : 'No data.'}</p>}
      </Card>

      <div className="an-row an-row-split">
        <Card title="Active users" sub="Signed-in members seen in each window. Not affected by the period filter.">
          <div className="mn-trio">
            <div><strong className="ltr-embed">{n(data?.activeUsers?.daily ?? 0)}</strong><span>Daily</span></div>
            <div><strong className="ltr-embed">{n(data?.activeUsers?.weekly ?? 0)}</strong><span>Weekly</span></div>
            <div><strong className="ltr-embed">{n(data?.activeUsers?.monthly ?? 0)}</strong><span>Monthly</span></div>
          </div>
        </Card>
        <Card title="Sign-in activity" sub={`In ${period}`}>
          <dl className="an-defs">
            <dt>Successful logins</dt><dd>{n(data?.auth?.logins ?? 0)}</dd>
            <dt>Failed attempts</dt><dd>{n(data?.auth?.failedLogins ?? 0)}</dd>
            <dt>New registrations</dt><dd>{n(data?.auth?.registrations ?? 0)}</dd>
            <dt>Logouts</dt><dd>{n(data?.auth?.logouts ?? 0)}</dd>
            <dt>Visitor → application</dt><dd>{fmtPct(k?.conversionRate ?? 0)}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

// ── 2. Live visitors & users ──────────────────

export function LiveSection({ filters, onUser }: { filters: Filters; onUser: (id: string) => void }) {
  const { board, mode, error } = useLiveBoard(filters);
  const [, tick] = useState(0);
  useEffect(() => { const h = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(h); }, []);
  const rows = board?.sessions || [];

  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="mn-conn" data-mode={mode}>
        <i aria-hidden="true" />
        {mode === 'stream' ? 'Connected — updating every few seconds' : mode === 'polling' ? 'Live stream unavailable — refreshing every 10 seconds' : 'Connecting…'}
      </div>
      <div className="an-kpis">
        <Kpi label="Live visitors" live value={n(board?.counts.total ?? 0)} sub="Everyone on the portal now" />
        <Kpi label="Guests" value={n(board?.counts.guests ?? 0)} sub="Not signed in" accent={SERIES[0]} />
        <Kpi label="Logged-in users" value={n(board?.counts.members ?? 0)} sub="Authenticated sessions" accent={SERIES[2]} />
        <Kpi label="Top location now" value={board?.topCountries[0]?.country || '—'} sub={board?.topCountries[0] ? `${board.topCountries[0].count} live` : 'No one online'} />
      </div>
      <Card title="Current sessions" sub={board ? `Updated ${new Date(board.at).toLocaleTimeString()}${board.truncated ? ' · showing the 200 most recent' : ''}` : undefined}>
        <SessionTable rows={rows} onUser={onUser} live empty="Nobody is on the portal right now." />
      </Card>
    </div>
  );
}

export function SessionTable({ rows, onUser, live = false, empty }: { rows: LiveSession[]; onUser?: (id: string) => void; live?: boolean; empty: string }) {
  if (!rows.length) return <p className="an-empty">{empty}</p>;
  return (
    <div className="mn-table-scroll">
      <table className="an-table mn-wide">
        <thead><tr>
          <th>Visitor</th><th>Status</th><th>Current page</th><th>Location</th><th>Device</th><th>IP</th>
          <th>Logged in</th><th>Last activity</th><th className="an-num">Duration</th><th className="an-num">Pages</th>
        </tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td><Who row={s} onUser={onUser} /></td>
              <td><span className={`mn-status ${s.status === 'LIVE' ? 'is-live' : ''}`}>{s.status === 'LIVE' ? 'Live' : 'Ended'}</span></td>
              <td><code className="mn-path">{s.currentPath}</code></td>
              <td>{s.city ? `${s.city}, ` : ''}{s.countryName}</td>
              <td>{s.device} · {s.browser}</td>
              <td className="mn-mono">{s.ip || '—'}</td>
              <td>{s.loggedInAt ? formatDateTime(s.loggedInAt) : '—'}</td>
              <td title={formatDateTime(s.lastSeenAt)}>{fmtAgo(s.lastSeenAt)}</td>
              <td className="an-num">{fmtDuration(live && s.status === 'LIVE' ? Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000) : s.durationSeconds)}</td>
              <td className="an-num">{s.pageViews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 3. Landing page ───────────────────────────

export function LandingSection({ filters }: { filters: Filters }) {
  const { data, loading, error } = useMonitoring<any>(monitoringAPI.landing, filters);
  if (!filtersReady(filters)) return <PendingRange />;
  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="an-kpis">
        <Kpi label="Landing page visits" value={n(data?.visits ?? 0)} sub={`${n(data?.visitors ?? 0)} unique visitors`} />
        <Kpi label="Bounce rate" value={fmtPct(data?.bounceRate ?? 0)} sub="Left after one page" />
        <Kpi label="Avg. time on site" value={fmtDuration(data?.avgSessionSeconds ?? 0)} sub="Per landing visit" />
        <Kpi label="Applied to join" value={n(data?.applied ?? 0)} sub={`${fmtPct(data?.applyRate ?? 0)} of landing visitors`} accent={SERIES[2]} />
        <Kpi label="Went on to sign in" value={n(data?.signedIn ?? 0)} sub="Landing visitors who logged in" />
      </div>
      <Card title="Landing page traffic" sub="Visits to the public home page over time">
        {data ? <TimeChart points={data.series} granularity={data.range.granularity}
          series={[{ key: 'visits', label: 'Visits', color: SERIES[0] }, { key: 'visitors', label: 'Unique visitors', color: SERIES[2] }]} />
          : <p className="an-empty">{loading ? 'Loading…' : 'No data.'}</p>}
      </Card>
      <Card title="Where landing visitors come from">
        <Bars rows={(data?.sources || []).map((s: any) => ({ label: s.source, value: s.visits }))} />
      </Card>
    </div>
  );
}

// ── 4. Geographic ─────────────────────────────

export function GeoSection({ filters }: { filters: Filters }) {
  const { data, error } = useMonitoring<any>(monitoringAPI.geo, filters);
  if (!filtersReady(filters)) return <PendingRange />;
  const unknown = data?.countries?.find((c: any) => !c.code);
  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="an-row an-row-split">
        <Card title="Visitors by country" sub="Unique visitors">
          <Bars rows={(data?.countries || []).slice(0, 12).map((c: any) => ({ label: c.country, value: c.visitors, sub: c.members ? `${c.members} members` : undefined }))} />
        </Card>
        <Card title="Visitors by city" sub="Where a city could be resolved">
          <Bars rows={(data?.cities || []).slice(0, 12).map((c: any) => ({ label: c.city, value: c.visitors, sub: c.country }))}
            empty="No city-level data yet." />
        </Card>
      </div>
      {unknown && <p className="an-footnote">{n(unknown.visitors)} visitors have no location: local or private addresses, or ones the location database does not cover.</p>}
      <Card title="All countries">
        <div className="mn-table-scroll"><table className="an-table">
          <thead><tr><th>Country</th><th className="an-num">Visitors</th><th className="an-num">Sessions</th><th className="an-num">Members</th></tr></thead>
          <tbody>{(data?.countries || []).map((c: any) => (
            <tr key={c.code || 'x'}><td>{c.country}</td><td className="an-num">{n(c.visitors)}</td><td className="an-num">{n(c.sessions)}</td><td className="an-num">{n(c.members)}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

// ── 5. Login & registration ───────────────────

const EVENT_LABEL: Record<string, string> = { LOGIN_SUCCESS: 'Login', LOGIN_FAILED: 'Failed login', LOGOUT: 'Logout', REGISTER: 'Registration' };

export function AuthSection({ filters, onUser }: { filters: Filters; onUser: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const key = JSON.stringify(toParams(filters));
  useEffect(() => { setPage(1); }, [key, type]);
  const { data, error } = useMonitoring<any>(monitoringAPI.auth, filters, { page: String(page), ...(type ? { type } : {}) });
  if (!filtersReady(filters)) return <PendingRange />;
  const t = data?.totals;
  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="an-kpis">
        <Kpi label="Successful logins" value={n(t?.logins ?? 0)} accent={SERIES[2]} />
        <Kpi label="Failed attempts" value={n(t?.failedLogins ?? 0)} sub={`${fmtPct(t?.failureRate ?? 0)} of attempts`} accent={SERIES[1]} />
        <Kpi label="New registrations" value={n(t?.registrations ?? 0)} accent={SERIES[0]} />
        <Kpi label="Logouts" value={n(t?.logouts ?? 0)} />
      </div>
      <Card title="Authentication activity" sub="Logins, failed attempts and registrations over time">
        {data ? <TimeChart points={data.series} granularity={data.range.granularity}
          series={[{ key: 'logins', label: 'Logins', color: SERIES[2] }, { key: 'failed', label: 'Failed', color: SERIES[1] }, { key: 'registrations', label: 'Registrations', color: SERIES[0] }]} />
          : <p className="an-empty">Loading…</p>}
      </Card>
      <Card title="Event history" right={
        <label className="an-field an-field-inline"><span>Event</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All events</option>
            {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>}>
        {data?.events?.length ? (
          <>
            <div className="mn-table-scroll"><table className="an-table mn-wide">
              <thead><tr><th>Time</th><th>Event</th><th>Member</th><th>IP</th><th>Location</th><th>Device</th></tr></thead>
              <tbody>{data.events.map((e: any) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.createdAt)}</td>
                  <td><span className={`mn-status ${e.type === 'LOGIN_FAILED' ? 'is-bad' : e.type === 'LOGIN_SUCCESS' ? 'is-live' : ''}`}>{EVENT_LABEL[e.type] || e.type}</span></td>
                  <td>{e.userId || e.email ? <Who row={{ userId: e.userId, name: e.name || e.email, email: e.name ? e.email : null }} onUser={onUser} /> : <span className="mn-guest">—</span>}</td>
                  <td className="mn-mono">{e.ip || '—'}</td>
                  <td>{e.city ? `${e.city}, ` : ''}{e.countryName}</td>
                  <td>{e.device} · {e.browser}</td>
                </tr>))}</tbody>
            </table></div>
            <Pager page={page} limit={data.pagination.limit} total={data.pagination.total} onPage={setPage} />
          </>
        ) : <p className="an-empty">No authentication events in this period.</p>}
      </Card>
    </div>
  );
}

// ── 6. User activity history ──────────────────

export function ActivitySection({ filters, open, onOpen }: { filters: Filters; open: string; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(toParams(filters));
  useEffect(() => { setPage(1); }, [key]);
  const list = useMonitoring<any>(monitoringAPI.sessions, filters, { page: String(page), limit: '25' });
  const history = useUserHistory(open, filters);
  if (!filtersReady(filters)) return <PendingRange />;

  return (
    <div className="mn-stack">
      <UserPicker onPick={onOpen} />
      {open && history.error && <ErrorNote error={history.error} />}
      {open && history.data && <UserHistory data={history.data} onClose={() => onOpen('')} />}
      <ErrorNote error={list.error} />
      <Card title="Session history" sub="Every visit matching the filters, newest first. Select a member's name to see their full history.">
        {list.data ? (
          <>
            <SessionTable rows={list.data.sessions} onUser={onOpen} empty="No sessions match these filters." />
            <Pager page={page} limit={list.data.pagination.limit} total={list.data.pagination.total} onPage={setPage} />
          </>
        ) : <p className="an-empty">{list.loading ? 'Loading…' : 'No data.'}</p>}
      </Card>
    </div>
  );
}

function useUserHistory(id: string, filters: Filters) {
  const [state, setState] = useState<{ data: any; error: string }>({ data: null, error: '' });
  useEffect(() => {
    if (!id) { setState({ data: null, error: '' }); return; }
    let live = true;
    monitoringAPI.user(id, {}).then((r) => live && setState({ data: r.data, error: '' }))
      .catch((e) => live && setState({ data: null, error: e?.response?.data?.error || 'Could not load this member.' }));
    return () => { live = false; };
  }, [id]);
  return state;
}

function UserPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [found, setFound] = useState<any[]>([]);
  useEffect(() => {
    if (dq.trim().length < 2) { setFound([]); return; }
    monitoringAPI.users(dq.trim()).then((r) => setFound(r.data.users || [])).catch(() => setFound([]));
  }, [dq]);
  return (
    <Card title="Find a member" sub="Search by name or email to open their activity timeline.">
      <input className="mn-search" type="search" value={q} placeholder="Start typing a name or email…" onChange={(e) => setQ(e.target.value)} />
      {found.length > 0 && (
        <ul className="mn-picklist">{found.map((u) => (
          <li key={u.id}><button type="button" onClick={() => { onPick(u.id); setQ(''); setFound([]); }}>
            <strong>{u.name}</strong><small>{u.email}</small></button></li>
        ))}</ul>
      )}
    </Card>
  );
}

const EVENT_NAMES: Record<string, string> = { ...EVENT_LABEL, PAGE_VIEW: 'Viewed page' };

function UserHistory({ data, onClose }: { data: any; onClose: () => void }) {
  const s = data.summary;
  return (
    <Card title={data.user.name} sub={`${data.user.email} · ${String(data.user.role).replace('_', ' ').toLowerCase()}`}
      right={<button type="button" className="mn-link-btn" onClick={onClose}>Close</button>}>
      <div className="an-kpis">
        <Kpi label="Sessions" value={n(s.sessions)} sub={s.firstSeen ? `First seen ${formatDateTime(s.firstSeen)}` : 'No recorded visits'} />
        <Kpi label="Logins" value={n(s.logins)} />
        <Kpi label="Time on portal" value={fmtDuration(s.totalSeconds)} sub={`${fmtDuration(s.avgSessionSeconds)} per session`} />
        <Kpi label="Page views" value={n(s.pageViews)} />
        <Kpi label="Last activity" value={fmtAgo(s.lastActivity)} sub={s.lastActivity ? formatDateTime(s.lastActivity) : undefined} />
      </div>
      <div className="an-row an-row-split mn-history">
        <div>
          <h4 className="mn-sub">Recent sessions</h4>
          <SessionTable rows={data.sessions} empty="No sessions recorded for this member." />
        </div>
        <div>
          <h4 className="mn-sub">Timeline</h4>
          {data.events.length ? (
            <ol className="mn-timeline">{data.events.map((e: any) => (
              <li key={e.id}>
                <time>{formatDateTime(e.createdAt)}</time>
                <span>{EVENT_NAMES[e.type] || e.type}{e.path && <code className="mn-path">{e.path}</code>}</span>
                <small>{e.device} · {e.browser}{e.ip ? ` · ${e.ip}` : ''}</small>
              </li>))}</ol>
          ) : <p className="an-empty">No activity recorded.</p>}
        </div>
      </div>
    </Card>
  );
}

// ── 7. Traffic & engagement ───────────────────

export function TrafficSection({ filters }: { filters: Filters }) {
  const { data, error } = useMonitoring<any>(monitoringAPI.traffic, filters);
  if (!filtersReady(filters)) return <PendingRange />;
  const t = data?.totals;
  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      <div className="an-kpis">
        <Kpi label="Sessions" value={n(t?.sessions ?? 0)} sub={`${n(t?.visitors ?? 0)} unique visitors`} />
        <Kpi label="Avg. session duration" value={fmtDuration(t?.avgSessionSeconds ?? 0)} />
        <Kpi label="Pages per session" value={String(t?.pagesPerSession ?? 0)} sub={`${fmtPct(t?.bounceRate ?? 0)} bounce rate`} />
        <Kpi label="Application rate" value={fmtPct(t?.applyRate ?? 0)} sub="Visitors who applied to join" accent={SERIES[2]} />
        <Kpi label="Login rate" value={fmtPct(t?.loginRate ?? 0)} sub="Sessions with a login" />
      </div>
      <div className="an-row an-row-split">
        <Card title="Most visited pages" sub="Page views"><Bars rows={(data?.pages || []).slice(0, 12).map((p: any) => ({ label: p.path, value: p.views, sub: `${p.visitors} visitors` }))} /></Card>
        <Card title="Traffic sources" sub="Sessions"><Bars rows={(data?.sources || []).slice(0, 12).map((s: any) => ({ label: s.source, value: s.sessions, sub: `${fmtDuration(s.avgSessionSeconds)} avg` }))} /></Card>
      </div>
      <div className="an-row an-row-split">
        <Card title="Devices"><Bars rows={(data?.devices || []).map((d: any) => ({ label: d.name, value: d.sessions }))} /></Card>
        <Card title="Browsers"><Bars rows={(data?.browsers || []).map((d: any) => ({ label: d.name, value: d.sessions }))} /></Card>
      </div>
    </div>
  );
}

// ── 8. Reports & exports ──────────────────────

const REPORTS = [
  ['sessions', 'Sessions', 'One row per visit: who, where, device, pages, duration and status.'],
  ['auth', 'Login & registration events', 'Every login, failed attempt, logout and registration.'],
  ['pages', 'Most visited pages', 'Page views and unique visitors per page.'],
  ['geo', 'Geographic summary', 'Visitors and sessions by country and city.'],
] as const;

export function ReportsSection({ filters, isSuper }: { filters: Filters; isSuper: boolean }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const download = async (report: string) => {
    setBusy(report); setError('');
    try {
      const res = await monitoringAPI.exportCsv(toParams(filters, { report }));
      downloadBlob(res.data, `tbc-${report}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: any) {
      // A blob error body has to be read as text before it is JSON.
      let msg = 'Export failed.';
      try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch { /* keep default */ }
      setError(msg);
    } finally { setBusy(''); }
  };
  const active = Object.entries(toParams(filters)).filter(([k, v]) => k !== 'range' && v).map(([k]) => k);
  return (
    <div className="mn-stack">
      <ErrorNote error={error} />
      {!filtersReady(filters) && <PendingRange />}
      <div className="an-note">
        Exports use the current filters ({RANGE_NAME[filters.range]}{active.length ? `, plus ${active.join(', ')}` : ''}) and open in Excel or any spreadsheet.
        {!isSuper && ' IP addresses are masked in exports for Admin accounts.'} Each export is recorded in the activity log.
      </div>
      <div className="mn-reports">
        {REPORTS.map(([key, title, sub]) => (
          <section className="an-card mn-report" key={key}>
            <h3 className="an-card-title">{title}</h3>
            <p className="an-card-sub">{sub}</p>
            <button type="button" className="mn-btn" disabled={Boolean(busy) || !filtersReady(filters)} onClick={() => download(key)}>
              {busy === key ? 'Preparing…' : 'Download CSV'}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
