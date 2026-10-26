'use client';
// src/components/admin/OverviewTab.tsx
//
// The admin panel's front page: what the portal is worth, what has been put
// in, what has been paid out, what is running, and how it all moved over a
// chosen period.
//
// WHAT IS ON SCREEN AND WHY IT IS THAT SHAPE:
//
//   KPI row       five headline numbers. Stat tiles, not a chart - a figure
//                 with a context line is the right form for a single value,
//                 and a five-bar bar chart would be the wrong one.
//   Donut + table assets by industry. Part-to-whole at a glance, capped at six
//                 slices; the full list is the table beside it, which is also
//                 the chart's accessible equivalent.
//   Flow          capital in vs profit out over time. Two series, one euro
//                 axis, HTML legend.
//   Activity      transactions per bucket. A count, so its own chart - never a
//                 second axis on the flow chart.
//   Meter         raised against target across live projects: one ratio
//                 against a limit.
//
// THE NUMBERS ARE NOT INTERCHANGEABLE, and the screen says so rather than
// hoping the reader knows:
//
//  - **Assets** is what the portal holds: the VALUATION of live companies and
//    projects plus the value of members' wallets. **Investment** is the
//    capital members have put in - the inflow behind part of the wallet half,
//    not a third asset line, and never added on top of it.
//  - The industry donut covers the VALUATION half only (`assets.portfolio`).
//    A wallet has no industry, so it is named beside the chart instead of
//    being folded into a sector it does not belong to.
//  - A **total** is as of now and includes undated opening balances. An
//    **in-period** figure is the dated ledger only. Every tile that can differ
//    shows both, labelled - see services/adminAnalytics.js for why opening
//    balances cannot be placed in a month.
//  - A record with no valuation is excluded from the money and counted in the
//    caption, so "€4.2M across 11 of 14" cannot be read as "€4.2M across 14".
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAPI, formatEur, formatNumber } from '@/lib/api';
import AssetsDonut from './charts/AssetsDonut';
import FlowChart from './charts/FlowChart';
import ActivityBars from './charts/ActivityBars';
import { topSlices, prettyCategory, compactEur, CAPITAL, PROFIT } from '@/lib/viz';
import '@/styles/analytics.css';

type RangeKey = 'all' | 'month' | 'quarter' | 'year' | 'custom';

const RANGE_LABELS: { key: RangeKey; label: string }[] = [
  { key: 'all',     label: 'All time' },
  { key: 'year',    label: 'This year' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'month',   label: 'This month' },
  { key: 'custom',  label: 'Custom' },
];

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];

const today = () => new Date().toISOString().slice(0, 10);

export default function OverviewTab() {
  const [range, setRange] = useState<RangeKey>('year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  // Empty means "let the window choose", which is what the API does by
  // default - the select shows what it actually chose.
  const [granularity, setGranularity] = useState('');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    // A custom range with no start is not a request yet; asking for it would
    // just produce a 400 the moment the admin clicks the tab.
    if (range === 'custom' && !from) { setLoading(false); return; }

    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { range };
      if (range === 'custom') { params.from = from; if (to) params.to = to; }
      if (granularity) params.granularity = granularity;

      const res = await adminAPI.getAnalytics(params);
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load the overview.');
    } finally {
      setLoading(false);
    }
  }, [range, from, to, granularity]);

  useEffect(() => { load(); }, [load]);

  const assets = data?.assets;
  const slices = useMemo(
    () => (assets ? topSlices(assets.byIndustry, (row: any) => prettyCategory(row.industry)) : []),
    [assets],
  );

  const periodLabel = useMemo(() => {
    if (!data?.range) return '';
    if (data.range.key === 'all') return 'all time';
    if (data.range.key === 'custom') {
      return `${String(data.range.from).slice(0, 10)} → ${String(data.range.to).slice(0, 10)}`;
    }
    return RANGE_LABELS.find((r) => r.key === data.range.key)?.label.toLowerCase() || '';
  }, [data]);

  return (
    <div className="an-root">

      {/* ── Filters: one row, above everything they affect ── */}
      <div className="an-filters">
        <div className="an-segmented" role="group" aria-label="Period">
          {RANGE_LABELS.map((r) => (
            <button key={r.key} type="button"
              className={`an-seg ${range === r.key ? 'is-on' : ''}`}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="an-dates">
            <label className="an-field">
              <span>From</span>
              <input type="date" value={from} max={to || today()}
                onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="an-field">
              <span>To</span>
              <input type="date" value={to} min={from} max={today()}
                onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        <label className="an-field an-field-inline">
          <span>Grouped by</span>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="">
              Auto{data?.range?.granularity ? ` (${data.range.granularity})` : ''}
            </option>
            {GRANULARITIES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>

        {loading && <span className="an-loading">Loading…</span>}
      </div>

      {error && <div className="an-error">{error}</div>}

      {range === 'custom' && !from && (
        <div className="an-note">Pick a start date to load a custom period.</div>
      )}

      {data && (
        <>
          {/* ── KPI row ── */}
          <div className="an-kpis">
            <Kpi
              label="Assets value"
              value={formatEur(assets.total)}
              accent={CAPITAL}
              foot={`${compactEur(assets.portfolio)} portfolio · ${compactEur(assets.wallets.value)} member wallets`}
              hint={`${assets.companies.count} companies · ${assets.projects.count} projects · ${assets.wallets.count} wallets`}
            />
            <Kpi
              label="Total investment"
              value={formatEur(data.investment.total)}
              accent={CAPITAL}
              foot={`${formatEur(data.investment.inRange)} in ${periodLabel}`}
              hint={data.investment.opening > 0
                ? `includes ${formatEur(data.investment.opening)} opening balances (undated)`
                : undefined}
            />
            <Kpi
              label="Profit paid to members"
              value={formatEur(data.profit.total)}
              accent={PROFIT}
              foot={`${formatEur(data.profit.inRange)} in ${periodLabel}`}
              hint={data.profit.opening > 0
                ? `includes ${formatEur(data.profit.opening)} opening profit (undated)`
                : undefined}
            />
            <Kpi
              label="Projects running"
              value={formatNumber(data.projects.running)}
              foot={`${data.projects.funded} funded · ${data.projects.draft} draft`}
              hint={`${formatEur(data.projects.raised)} raised of ${formatEur(data.projects.target)}`}
            />
            <Kpi
              label="Transactions to date"
              value={formatNumber(data.transactions.total)}
              foot={`${formatNumber(data.transactions.inRange)} in ${periodLabel}`}
              hint={`${formatEur(data.transactions.volume)} moved all time`}
            />
          </div>

          {/* ── Assets by industry ── */}
          <div className="an-row an-row-split">
            <section className="an-card">
              <header className="an-card-head">
                <div>
                  <h3 className="an-card-title">Assets by industry</h3>
                  <p className="an-card-sub">
                    Valuation of live companies and projects — {formatEur(assets.portfolio)} of
                    the {formatEur(assets.total)} total. Member wallets are the rest and have
                    no industry.
                  </p>
                </div>
              </header>

              <div className="an-split">
                <AssetsDonut
                  slices={slices}
                  total={assets.portfolio}
                  caption={`${assets.byIndustry.length} ${assets.byIndustry.length === 1 ? 'industry' : 'industries'}`}
                />

                {/* The legend AND the table view: identity never rests on
                    colour alone, and the long tail the donut folds into
                    "Other" is readable here. */}
                <div className="an-legend">
                  {assets.byIndustry.length === 0 && (
                    <p className="an-empty">No live companies or projects yet.</p>
                  )}
                  {assets.byIndustry.map((row: any, i: number) => {
                    const slice = slices.find((s) => s.label === prettyCategory(row.industry));
                    return (
                      <div className="an-legend-row" key={row.industry}>
                        <span className="an-swatch"
                          style={{ background: slice?.color || 'var(--text-muted)' }} aria-hidden="true" />
                        <span className="an-legend-name" title={row.industry}>
                          {prettyCategory(row.industry)}
                        </span>
                        <span className="an-legend-meta">
                          {row.companies ? `${row.companies}c` : ''}
                          {row.companies && row.projects ? ' · ' : ''}
                          {row.projects ? `${row.projects}p` : ''}
                        </span>
                        <span className="an-legend-value ltr-embed">{compactEur(row.total)}</span>
                        <span className="an-legend-share">{row.share}%</span>
                      </div>
                    );
                  })}

                  <p className="an-footnote">
                    Member wallets hold a further {formatEur(assets.wallets.value)} across{' '}
                    {assets.wallets.count} wallet{assets.wallets.count === 1 ? '' : 's'}
                    {' '}({formatEur(assets.wallets.capital)} capital ·{' '}
                    {formatEur(assets.wallets.profit)} available profit), counted in the
                    assets total but not in this table.
                  </p>

                  {(assets.companies.unvalued > 0 || assets.projects.unvalued > 0) && (
                    <p className="an-footnote">
                      {assets.companies.unvalued + assets.projects.unvalued} live record
                      {assets.companies.unvalued + assets.projects.unvalued === 1 ? ' has' : 's have'} no
                      valuation and {assets.companies.unvalued + assets.projects.unvalued === 1 ? 'is' : 'are'} not
                      in this total.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* ── Projects meter ── */}
            <section className="an-card an-card-narrow">
              <header className="an-card-head">
                <div>
                  <h3 className="an-card-title">Funding</h3>
                  <p className="an-card-sub">Raised against target, across live projects.</p>
                </div>
              </header>

              <p className="an-hero ltr-embed">{data.projects.fundingProgress}%</p>
              <div className="an-meter" role="img"
                aria-label={`${data.projects.fundingProgress}% of target raised`}>
                <span className="an-meter-fill"
                  style={{ width: `${Math.min(100, data.projects.fundingProgress)}%` }} />
              </div>
              <p className="an-meter-foot">
                <strong className="ltr-embed">{formatEur(data.projects.raised)}</strong> of{' '}
                <span className="ltr-embed">{formatEur(data.projects.target)}</span>
              </p>

              <dl className="an-defs">
                <div><dt>Running</dt><dd>{formatNumber(data.projects.running)}</dd></div>
                <div><dt>Funded</dt><dd>{formatNumber(data.projects.funded)}</dd></div>
                <div><dt>Closed</dt><dd>{formatNumber(data.projects.closed)}</dd></div>
                <div><dt>Draft</dt><dd>{formatNumber(data.projects.draft)}</dd></div>
              </dl>

              <dl className="an-defs an-defs-top">
                <div><dt>Active members</dt><dd>{formatNumber(data.members.active)}</dd></div>
                <div><dt>Pending</dt><dd>{formatNumber(data.members.pending)}</dd></div>
              </dl>
            </section>
          </div>

          {/* ── Flow over time ── */}
          <section className="an-card">
            <header className="an-card-head">
              <div>
                <h3 className="an-card-title">Capital in and profit out</h3>
                <p className="an-card-sub">
                  Dated ledger entries only, by {data.range.granularity}. Opening
                  balances carry no date and are not plotted.
                </p>
              </div>
              <div className="an-legend-inline">
                <span><i style={{ background: CAPITAL }} />Capital in</span>
                <span><i style={{ background: PROFIT }} />Profit out</span>
              </div>
            </header>

            <FlowChart
              points={data.series}
              granularity={data.range.granularity}
              labels={{ investment: 'Capital in', profit: 'Profit out' }}
            />
          </section>

          {/* ── Transactions ── */}
          <div className="an-row an-row-split">
            <section className="an-card">
              <header className="an-card-head">
                <div>
                  <h3 className="an-card-title">Transactions booked</h3>
                  <p className="an-card-sub">
                    Count per {data.range.granularity}. A count and a euro amount do not
                    share a scale, so volume is in the tooltip rather than on a second axis.
                  </p>
                </div>
              </header>
              <ActivityBars
                points={data.series}
                granularity={data.range.granularity}
                label="Transactions"
              />
            </section>

            <section className="an-card an-card-narrow">
              <header className="an-card-head">
                <div>
                  <h3 className="an-card-title">By category</h3>
                  <p className="an-card-sub">In {periodLabel}.</p>
                </div>
              </header>

              {data.transactions.byCategory.length === 0 ? (
                <p className="an-empty">No transactions in this period.</p>
              ) : (
                <table className="an-table">
                  <thead>
                    <tr><th>Category</th><th>Count</th><th>Volume</th></tr>
                  </thead>
                  <tbody>
                    {data.transactions.byCategory.map((c: any) => (
                      <tr key={c.category}>
                        <td>{prettyCategory(c.category)}</td>
                        <td className="an-num">{formatNumber(c.count)}</td>
                        <td className="an-num ltr-embed">{compactEur(c.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One headline number: value, what it covers, and the caveat if it has one.
 * `accent` is a thin rule, not a coloured number - a figure wears text ink, and
 * the colour beside it carries the identity.
 */
function Kpi({ label, value, foot, hint, accent }: {
  label: string; value: string; foot?: string; hint?: string; accent?: string;
}) {
  return (
    <div className="an-kpi">
      {accent && <span className="an-kpi-rule" style={{ background: accent }} aria-hidden="true" />}
      <p className="an-kpi-label">{label}</p>
      <p className="an-kpi-value ltr-embed">{value}</p>
      {foot && <p className="an-kpi-foot">{foot}</p>}
      {hint && <p className="an-kpi-hint">{hint}</p>}
    </div>
  );
}
