'use client';
// src/components/admin/ReceiptsPanel.tsx
//
// Super Admin -> Receipts & Zoho -> Receipts. Every invoice the portal has
// issued (or tried to), 50 to a page, searchable by member name, email or
// invoice number. Retrying and opening the PDF live here; the connection and
// the go-live switch stay under Integrations -> Zoho Books.
import React, { useCallback, useEffect, useState } from 'react';
import { zohoAPI, receiptsAPI, formatDateTime, formatEur } from '@/lib/api';
import '@/styles/projects.css';

type Status = 'PENDING' | 'DRAFT' | 'ISSUED' | 'DEAD';
interface Row {
  id: string; status: Status; amount: number;
  receiptNumber: string | null; attempts: number; lastError: string | null;
  issuedAt: string | null; emailedAt: string | null; createdAt: string;
  user: { id: string; name: string; email: string };
}

const CARD: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 };
const STATUS_STYLE: Record<Status, React.CSSProperties> = {
  ISSUED:  { background: 'rgba(46,204,113,0.14)', color: '#5ad68c' },
  PENDING: { background: 'rgba(255,190,50,0.14)', color: '#f0c04a' },
  DRAFT:   { background: 'rgba(120,150,255,0.16)', color: '#8fa8ff' },
  DEAD:    { background: 'rgba(224,82,82,0.14)',  color: '#e8706f' },
};
const SMALL: React.CSSProperties = { padding: '2px 10px', fontSize: 12 };

export default function ReceiptsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (filter) params.status = filter;
    if (q.trim()) params.q = q.trim();
    try {
      const r = await zohoAPI.receipts(params);
      setRows(r.data.receipts); setPages(r.data.pagination.totalPages || 1); setTotal(r.data.pagination.total); setError('');
    } catch (e: any) { setError(e?.response?.data?.error || 'Could not load receipts.'); }
  }, [filter, q, page]);

  const loadCounts = useCallback(() => {
    zohoAPI.get().then((r) => setCounts(r.data.counts)).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const refresh = () => { load(); loadCounts(); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e: any) { setError(e?.response?.data?.error || 'That did not work.'); } finally { setBusy(false); }
  };
  const retry = (id: string) => run(async () => { await receiptsAPI.retry(id); refresh(); });
  const retryAll = () => run(async () => {
    const r = await zohoAPI.retryDead(); setNotice(`${r.data.retried} invoice(s) queued again.`); refresh();
  });
  const openPdf = async (id: string) => {
    const tab = window.open('', '_blank');
    try {
      const res = await receiptsAPI.pdf(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch { if (tab) tab.close(); setError('Could not open that invoice.'); }
  };

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['', 'PENDING', 'DRAFT', 'ISSUED', 'DEAD'] as const).map((f) => (
          <button key={f || 'all'} type="button" className={`pj-btn ${filter === f ? 'pj-btn-primary' : 'pj-btn-ghost'}`}
            style={{ padding: '3px 12px', fontSize: 12 }} onClick={() => { setFilter(f); setPage(1); }}>
            {f ? `${f[0]}${f.slice(1).toLowerCase()}${counts ? ` (${counts[f]})` : ''}` : 'All'}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {counts && counts.DEAD > 0 && (
          <button type="button" className="pj-btn pj-btn-ghost" disabled={busy} onClick={retryAll}>Retry all failed ({counts.DEAD})</button>
        )}
      </div>

      <input className="form-input" placeholder="Search member name, email or invoice number" value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ marginBottom: 12, maxWidth: 380 }} />
      {error  && <div className="pj-error">{error}</div>}
      {notice && <div className="pj-ok">{notice}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Invoice</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.createdAt)}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.user?.name}</div>
                  <div className="ltr-embed" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.user?.email}</div>
                </td>
                <td className="ltr-embed">{formatEur(r.amount)}</td>
                <td className="ltr-embed" style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.receiptNumber || '—'}</td>
                <td>
                  <span style={{ ...STATUS_STYLE[r.status], fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>{r.status}</span>
                  {r.status === 'ISSUED' && !r.emailedAt && <div style={HINT}>email pending</div>}
                  {r.status === 'DRAFT' && <div style={HINT}>draft in Zoho · not sent</div>}
                  {r.lastError && <div style={{ ...HINT, color: '#e8706f', maxWidth: 320 }}>{r.lastError} (attempt {r.attempts})</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {(r.status === 'ISSUED' || r.status === 'DRAFT')
                    ? <button type="button" className="pj-btn pj-btn-ghost" style={SMALL} onClick={() => openPdf(r.id)}>Open</button>
                    : <button type="button" className="pj-btn pj-btn-ghost" style={SMALL} disabled={busy} onClick={() => retry(r.id)}>Retry</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No receipts match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, alignItems: 'center' }}>
        {pages > 1 && <button type="button" className="pj-btn pj-btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} receipt{total === 1 ? '' : 's'}{pages > 1 ? ` · page ${page} / ${pages}` : ''}</span>
        {pages > 1 && <button type="button" className="pj-btn pj-btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>}
      </div>
    </div>
  );
}
