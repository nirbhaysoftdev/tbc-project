'use client';
// src/components/admin/monitoring/shared.tsx
//
// What every Analytics & Monitoring section shares: the filter object and the
// bar that edits it, the line and bar charts, and the small display helpers.
// One filter object drives every section, so a filter set on the Overview is
// still set when the admin opens Geographic or Reports.
import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { monitoringAPI } from '@/lib/api';
import { SERIES, GRID, INK_MUTED, SURFACE, TOOLTIP, bucketLabel } from '@/lib/viz';
import '@/styles/analytics.css';
import '@/styles/monitoring.css';

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

// ── Filters ───────────────────────────────────

export interface Filters {
  range: 'today' | '7d' | '30d' | '90d' | 'custom';
  from: string; to: string;
  q: string; ip: string;
  country: string; device: string; browser: string;
  audience: '' | 'guest' | 'member';
  status: '' | 'live' | 'ended';
  userId: string;
}

export const DEFAULT_FILTERS: Filters = {
  range: '7d', from: '', to: '', q: '', ip: '', country: '', device: '', browser: '', audience: '', status: '', userId: '',
};

/** Only what is set, so the URL and the cache key stay short and a blank never means "match nothing". */
export function toParams(f: Filters, extra: Record<string, string> = {}): Record<string, string> {
  const p: Record<string, string> = { range: f.range };
  (['q', 'ip', 'country', 'device', 'browser', 'audience', 'status', 'userId'] as const).forEach((k) => {
    if (f[k]) p[k] = f[k];
  });
  if (f.range === 'custom') { if (f.from) p.from = f.from; if (f.to) p.to = f.to; }
  return { ...p, ...extra };
}

/** A custom range with no start has nothing to ask the server yet. */
export const filtersReady = (f: Filters) => f.range !== 'custom' || Boolean(f.from && f.to);

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return v;
}

const RANGES: Array<[Filters['range'], string]> = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom']];

interface Options { countries: Array<{ code: string; name: string }>; devices: string[]; browsers: string[] }

export function FilterBar({ filters, onChange, hideRange = false, hideStatus = false, isSuper }: {
  filters: Filters; onChange: (f: Filters) => void; hideRange?: boolean; hideStatus?: boolean; isSuper: boolean;
}) {
  const [opts, setOpts] = useState<Options>({ countries: [], devices: [], browsers: [] });
  useEffect(() => { monitoringAPI.options().then((r) => setOpts(r.data)).catch(() => {}); }, []);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const today = new Date().toISOString().slice(0, 10);
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="mn-filters">
      <div className="an-filters">
        {!hideRange && (
          <div className="an-segmented" role="group" aria-label="Period">
            {RANGES.map(([key, label]) => (
              <button key={key} type="button" className={`an-seg ${filters.range === key ? 'is-on' : ''}`}
                aria-pressed={filters.range === key} onClick={() => set({ range: key })}>{label}</button>
            ))}
          </div>
        )}
        {!hideRange && filters.range === 'custom' && (
          <div className="an-dates">
            <label className="an-field"><span>From</span>
              <input type="date" value={filters.from} max={filters.to || today} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="an-field"><span>To</span>
              <input type="date" value={filters.to} min={filters.from} max={today} onChange={(e) => set({ to: e.target.value })} /></label>
          </div>
        )}
      </div>

      <div className="mn-filter-grid">
        <label className="an-field"><span>User or email</span>
          <input type="search" value={filters.q} placeholder="Name or email" onChange={(e) => set({ q: e.target.value })} /></label>
        <label className="an-field"><span>IP address{isSuper ? '' : ' (first 3 parts)'}</span>
          <input type="text" value={filters.ip} placeholder={isSuper ? '203.0.113.7' : '203.0.113'} onChange={(e) => set({ ip: e.target.value })} /></label>
        <label className="an-field"><span>Country</span>
          <select value={filters.country} onChange={(e) => set({ country: e.target.value })}>
            <option value="">All countries</option>
            {opts.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select></label>
        <label className="an-field"><span>Device</span>
          <select value={filters.device} onChange={(e) => set({ device: e.target.value })}>
            <option value="">All devices</option>
            {opts.devices.map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="an-field"><span>Browser</span>
          <select value={filters.browser} onChange={(e) => set({ browser: e.target.value })}>
            <option value="">All browsers</option>
            {opts.browsers.map((b) => <option key={b} value={b}>{b}</option>)}
          </select></label>
        <label className="an-field"><span>Visitors</span>
          <select value={filters.audience} onChange={(e) => set({ audience: e.target.value as Filters['audience'] })}>
            <option value="">Guests and members</option>
            <option value="guest">Guests only</option>
            <option value="member">Logged-in members only</option>
          </select></label>
        {!hideStatus && (
          <label className="an-field"><span>Session status</span>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })}>
              <option value="">Live and ended</option>
              <option value="live">Live now</option>
              <option value="ended">Ended</option>
            </select></label>
        )}
        {dirty && (
          <button type="button" className="mn-reset" onClick={() => onChange(DEFAULT_FILTERS)}>Reset filters</button>
        )}
      </div>
    </div>
  );
}

// ── Display helpers ───────────────────────────

export function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '0s';
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`;

export function fmtAgo(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Building blocks ───────────────────────────

export function Kpi({ label, value, sub, live, accent }: { label: string; value: string; sub?: string; live?: boolean; accent?: string }) {
  return (
    <div className="an-kpi">
      {accent && <span className="an-kpi-rule" style={{ background: accent }} aria-hidden="true" />}
      <p className="an-kpi-label">
        {label}
        {live && <span className="mn-live-pill"><i aria-hidden="true" />Live</span>}
      </p>
      <p className="an-kpi-value ltr-embed" style={live ? { color: 'var(--green)' } : undefined}>{value}</p>
      {sub && <p className="an-kpi-foot">{sub}</p>}
    </div>
  );
}

export function Card({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="an-card">
      <header className="an-card-head">
        <div><h3 className="an-card-title">{title}</h3>{sub && <p className="an-card-sub">{sub}</p>}</div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return <p className="mn-pager-note">{total} {total === 1 ? 'row' : 'rows'}</p>;
  return (
    <div className="mn-pager">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages} · {total} rows</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/** Horizontal bars, the form for ranked categories (a country, a page, a source). */
export function Bars({ rows, empty = 'No data in this period.' }: { rows: Array<{ label: string; value: number; sub?: string }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="an-empty">{empty}</p>;
  return (
    <ul className="mn-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mn-bar-top">
            <span className="mn-bar-label" title={r.label}>{r.label}{r.sub && <small>{r.sub}</small>}</span>
            <span className="mn-bar-value ltr-embed">{r.value.toLocaleString()}</span>
          </div>
          <div className="mn-bar-track"><span style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export interface LineSeries { key: string; label: string; color?: string }

/**
 * One or more series over time, with the figures in a table beneath it - the
 * chart is for shape, the table is for the number and for anyone who cannot
 * read a colour. "Expand chart" doubles the height.
 */
export function TimeChart({ points, series, granularity, valueLabel = '' }: {
  points: Array<Record<string, any>>; series: LineSeries[]; granularity: string; valueLabel?: string;
}) {
  const [tall, setTall] = useState(false);
  const colors = series.map((s, i) => s.color || SERIES[i % SERIES.length]);

  const data = useMemo(() => ({
    labels: points.map((p) => bucketLabel(String(p.bucket).slice(0, 10), granularity)),
    datasets: series.map((s, i) => ({
      label: s.label, data: points.map((p) => p[s.key] ?? 0),
      borderColor: colors[i], borderWidth: 2, tension: 0.35,
      pointRadius: points.length <= 14 ? 4 : 0, pointHoverRadius: 5,
      pointBackgroundColor: colors[i], pointBorderColor: SURFACE, pointBorderWidth: 2, pointHitRadius: 18,
    })),
  }), [points, series, granularity]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, callbacks: { label: (c: any) => ` ${c.dataset.label}: ${Number(c.parsed.y).toLocaleString()}${valueLabel}` } } },
    scales: {
      x: { grid: { display: false }, border: { color: GRID }, ticks: { color: INK_MUTED, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: GRID, drawTicks: false }, border: { display: false }, ticks: { color: INK_MUTED, font: { size: 10 }, padding: 8, maxTicksLimit: 5, precision: 0 } },
    },
  }), [valueLabel]);

  const empty = points.length === 0 || points.every((p) => series.every((s) => !p[s.key]));
  return (
    <div>
      <div className="mn-chart-tools">
        <div className="an-legend-inline">
          {series.map((s, i) => <span key={s.key}><i style={{ background: colors[i] }} />{s.label}</span>)}
        </div>
        <button type="button" className="mn-link-btn" onClick={() => setTall((t) => !t)}>{tall ? 'Collapse chart' : 'Expand chart'}</button>
      </div>
      <div className="an-chart-canvas" style={{ height: tall ? 460 : 260 }}>
        {empty ? <p className="an-empty">No traffic recorded in this period yet.</p> : <Line data={data} options={options as any} />}
      </div>
      {!empty && (
        <div className="mn-table-scroll mn-chart-table">
          <table className="an-table">
            <thead><tr><th />{series.map((s) => <th key={s.key} className="an-num">{s.label}</th>)}</tr></thead>
            <tbody>
              {[...points].reverse().slice(0, 31).map((p) => (
                <tr key={p.bucket}>
                  <th scope="row">{bucketLabel(String(p.bucket).slice(0, 10), granularity)}</th>
                  {series.map((s) => <td key={s.key} className="an-num">{Number(p[s.key] ?? 0).toLocaleString()}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Who({ row, onUser }: { row: { kind?: string; name?: string | null; email?: string | null; userId?: string | null }; onUser?: (id: string) => void }) {
  if (!row.userId && !row.name) return <span className="mn-guest">Guest</span>;
  const body = (<><strong>{row.name || 'Member'}</strong><small>{row.email}</small></>);
  return row.userId && onUser
    ? <button type="button" className="mn-who mn-who-link" onClick={() => onUser(row.userId!)}>{body}</button>
    : <span className="mn-who">{body}</span>;
}

export function ErrorNote({ error }: { error: string }) {
  return error ? <div className="an-error">{error}</div> : null;
}

export const errText = (e: any) => e?.response?.data?.error || 'Could not load analytics.';
