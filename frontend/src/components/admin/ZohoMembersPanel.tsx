'use client';
// src/components/admin/ZohoMembersPanel.tsx
//
// Super Admin -> Zoho Books -> Members. Every member with their own Zoho switch,
// and the two totals that matter: how many are connected and how many are not.
// A member switched off is never made a customer and never invoiced.
import React, { useCallback, useEffect, useState } from 'react';
import { zohoAPI } from '@/lib/api';
import ZohoSwitch, { ZohoDot } from './ZohoSwitch';

interface Row { id: string; name: string; email: string; status: string; zohoEnabled: boolean; linked: boolean }
type Filter = 'all' | 'enabled' | 'disabled';

const CARD: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 };

export default function ZohoMembersPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ total: 0, enabled: 0, disabled: 0 });
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await zohoAPI.members({ filter, q, page: String(page) });
      setRows(r.data.members); setTotals(r.data.totals); setPages(r.data.pagination.totalPages || 1); setError('');
    } catch (e: any) { setError(e?.response?.data?.error || 'Could not load members.'); }
  }, [filter, q, page]);

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const toggle = async (m: Row) => {
    setBusyId(m.id);
    try { await zohoAPI.setMember(m.id, !m.zohoEnabled); await load(); }
    catch (e: any) { setError(e?.response?.data?.error || 'Could not change this member.'); }
    finally { setBusyId(''); }
  };

  const tiles: { key: Filter; label: string; value: number; dot?: boolean }[] = [
    { key: 'all', label: 'Total members', value: totals.total },
    { key: 'enabled', label: 'Zoho enabled', value: totals.enabled, dot: true },
    { key: 'disabled', label: 'Zoho disabled', value: totals.disabled, dot: false },
  ];

  return (
    <div style={CARD}>
      <span style={LABEL}>Members</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0' }}>
        {tiles.map((t) => (
          <button key={t.key} type="button" onClick={() => { setFilter(t.key); setPage(1); }}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', font: 'inherit', color: 'inherit',
              background: filter === t.key ? 'var(--bg-elevated, rgba(255,255,255,0.05))' : 'transparent',
              border: `1px solid ${filter === t.key ? 'var(--text-muted)' : 'var(--border)'}`,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.dot !== undefined && <ZohoDot on={t.dot} />}{t.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{t.value}</div>
          </button>
        ))}
      </div>

      <input className="form-input" placeholder="Search name or email" value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ marginBottom: 12, maxWidth: 340 }} />
      {error && <div style={{ color: '#e8706f', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th>Member</th><th>Account</th><th>Zoho customer</th><th>Zoho</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div className="ltr-embed" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}</div>
                </td>
                <td style={{ fontSize: 12 }}>{m.status}</td>
                <td style={{ fontSize: 12, color: m.linked ? 'var(--text-primary)' : 'var(--text-muted)' }}>{m.linked ? 'Linked' : 'Not yet'}</td>
                <td><ZohoSwitch on={m.zohoEnabled} busy={busyId === m.id} onToggle={() => toggle(m)} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No members match.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, alignItems: 'center' }}>
          <button type="button" className="pj-btn pj-btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{page} / {pages}</span>
          <button type="button" className="pj-btn pj-btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
        A member switched off is never made a Zoho customer and their new investments get no invoice. Invoices already queued are not recalled.
      </div>
    </div>
  );
}
