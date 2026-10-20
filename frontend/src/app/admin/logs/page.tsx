'use client';
// src/app/admin/logs/page.tsx
// Every notable thing the system did, newest first, with filters by category
// and by individual activity type. The filter catalogue comes from the backend
// (services/activityLog.js) so a new activity type shows up here on its own.
import { Fragment, useEffect, useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { adminAPI, formatEur, formatDateTime } from '@/lib/api';
import { useTranslation } from 'react-i18next';

type LogType = { type: string; label: string; category: string; count: number };
type Category = { category: string; count: number };

type Log = {
  id: string;
  type: string;
  category: string;
  title: string;
  description?: string | null;
  actorName?: string | null;
  targetName?: string | null;
  amount?: number | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?:  { id: string; name: string; email: string } | null;
  target?: { id: string; name: string; email: string } | null;
};

const CATEGORY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  EMAIL:      { color: '#7fb0ff', bg: 'rgba(58,111,255,0.12)',  label: 'Emails' },
  MEMBER:     { color: '#c8a84b', bg: 'rgba(200,168,75,0.12)',  label: 'Members' },
  INVESTMENT: { color: '#4cd98a', bg: 'rgba(76,217,138,0.12)',  label: 'Investments' },
  PROFIT:     { color: '#a0e86f', bg: 'rgba(160,232,111,0.12)', label: 'Profit' },
  WITHDRAWAL: { color: '#ffbe32', bg: 'rgba(255,190,50,0.12)',  label: 'Withdrawals' },
  WALLET:     { color: '#b79cff', bg: 'rgba(160,140,255,0.14)', label: 'Wallet' },
  SYSTEM:     { color: '#8c9ab5', bg: 'rgba(140,154,181,0.12)', label: 'System' },
  // Privileged actions on their own filter: the view you want when answering
  // "who changed this account?".
  SUPER_ADMIN:{ color: '#ff8f6b', bg: 'rgba(255,143,107,0.13)', label: 'Super admin' },
};

const PAGE_SIZE = 50;

function LogsContent() {
  const { t } = useTranslation(['admin', 'common']);
  const [logs,       setLogs]       = useState<Log[]>([]);
  const [types,      setTypes]      = useState<LogType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [category, setCategory] = useState('');
  const [type,     setType]     = useState('');
  const [status,   setStatus]   = useState('');
  const [search,   setSearch]   = useState('');
  const [query,    setQuery]    = useState('');   // the committed search term
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [page,     setPage]     = useState(1);

  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    adminAPI.getLogTypes()
      .then(r => { setTypes(r.data.types); setCategories(r.data.categories); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (category) params.category = category;
    if (type)     params.type     = type;
    if (status)   params.status   = status;
    if (query)    params.search   = query;
    if (from)     params.from     = from;
    if (to)       params.to       = to;

    adminAPI.getLogs(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.pagination.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, type, status, query, from, to, page]);

  const resetTo = (fn: () => void) => { fn(); setPage(1); };

  // Only offer types that belong to the selected category.
  const visibleTypes = category ? types.filter(t => t.category === category) : types;

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const chip = (label: string, active: boolean, onClick: () => void, count?: number) => (
    <button key={label} onClick={onClick}
      style={{
        padding: '6px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        borderRadius: 999, whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
        background: active ? 'rgba(200,168,75,0.14)' : 'transparent',
        color: active ? 'var(--gold)' : 'var(--text-muted)',
      }}>
      {label}{count != null ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">{t('admin:logs.title')}</h1>
        {/* One interpolated plural key rather than an English ternary: Italian
            inflects the noun with the number. */}
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('admin:logs.entries', { count: total })}
        </span>
      </div>

      {/* ── Category filter ── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        {chip(t('admin:logs.allActivity'), !category, () => resetTo(() => { setCategory(''); setType(''); }))}
        {categories.map(c => chip(
          CATEGORY_STYLE[c.category]?.label || c.category,
          category === c.category,
          () => resetTo(() => { setCategory(c.category); setType(''); }),
          c.count,
        ))}
      </div>

      {/* ── Type / status / search / date filters ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select className="filter-select" value={type}
          onChange={e => resetTo(() => setType(e.target.value))}
          style={{ minWidth: 210 }}>
          <option value="">{t('admin:logs.allTypes')}</option>
          {visibleTypes.map(t => (
            <option key={t.type} value={t.type}>{t.label} ({t.count})</option>
          ))}
        </select>

        <select className="filter-select" value={status}
          onChange={e => resetTo(() => setStatus(e.target.value))}>
          {/* `value` is the API's status filter and stays the raw enum. */}
          <option value="">{t('admin:logs.anyResult')}</option>
          <option value="SUCCESS">{t('admin:logs.success')}</option>
          <option value="FAILED">{t('admin:logs.failedResult')}</option>
        </select>

        <form onSubmit={e => { e.preventDefault(); resetTo(() => setQuery(search)); }}
          style={{ display: 'flex', gap: 6 }}>
          <input className="filter-select" placeholder={t('admin:logs.searchTitleMember')}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200 }} />
          <button type="submit" className="btn-primary" style={{ padding: '7px 16px', fontSize: 12 }}>
            {t('common:action.search')}
          </button>
        </form>

        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {t('admin:logs.from')}
          <input type="date" className="filter-select" value={from}
            onChange={e => resetTo(() => setFrom(e.target.value))} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {t('admin:logs.to')}
          <input type="date" className="filter-select" value={to}
            onChange={e => resetTo(() => setTo(e.target.value))} />
        </label>

        {(category || type || status || query || from || to) && (
          <button onClick={() => resetTo(() => {
            setCategory(''); setType(''); setStatus('');
            setSearch(''); setQuery(''); setFrom(''); setTo('');
          })}
            style={{
              padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
            }}>
            {t('common:action.clearFilters')}
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="spinner" />
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {t('admin:logs.emptyFiltered')}
        </div>
      ) : (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('admin:logs.when')}</th>
                <th>{t('admin:logs.activity')}</th>
                <th>{t('admin:logs.details')}</th>
                <th>{t('admin:logs.member')}</th>
                <th>{t('admin:logs.by')}</th>
                {/* `end`, not `right`: the amount column hugs the reading edge. */}
                <th style={{ textAlign: 'end' }}>{t('common:label.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const cat = CATEGORY_STYLE[log.category] || CATEGORY_STYLE.SYSTEM;
                const failed = log.status === 'FAILED';
                const isOpen = expanded === log.id;
                const typeLabel = types.find(t => t.type === log.type)?.label || log.type;
                return (
                  <Fragment key={log.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : log.id)}
                      style={{ cursor: 'pointer' }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '3px 9px', borderRadius: 999,
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                          background: failed ? 'rgba(224,82,82,0.12)' : cat.bg,
                          color: failed ? 'var(--red)' : cat.color,
                        }}>
                          {typeLabel}{failed ? t('admin:logs.failedSuffix') : ''}
                        </span>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.title}</div>
                        {log.description && (
                          <div style={{
                            fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: isOpen ? 'normal' : 'nowrap',
                          }}>
                            {log.description}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{log.target?.name || log.targetName || t('admin:logs.noneDash')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {log.actor?.name || log.actorName || t('admin:logs.system')}
                      </td>
                      <td className="ltr-embed" style={{ textAlign: 'end', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {log.amount != null ? formatEur(log.amount) : t('admin:logs.noneDash')}
                      </td>
                    </tr>
                    {isOpen && log.metadata && (
                      <tr>
                        <td colSpan={6} style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <pre style={{
                            margin: 0, padding: '8px 2px', fontSize: 11, lineHeight: 1.6,
                            color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
              opacity: page <= 1 ? 0.4 : 1,
            }}>
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: page >= pages ? 'default' : 'pointer',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
              opacity: page >= pages ? 0.4 : 1,
            }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function LogsPage() {
  return (
    <ProtectedLayout requireAdmin>
      <LogsContent />
    </ProtectedLayout>
  );
}
