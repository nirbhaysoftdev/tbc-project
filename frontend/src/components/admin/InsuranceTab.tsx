'use client';
// src/components/admin/InsuranceTab.tsx
//
// Super Admin → Insurance: every member's annual insurance policy in one table
// (capital, %, the amount it will credit, renewal date, status), with the
// controls to add a policy, change it, or switch it off.
//
// Super admin only, structurally: the page is wrapped in requireSuperAdmin and
// every endpoint behind it is too.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { insuranceAPI, formatEur, formatNumber, formatDate } from '@/lib/api';
import InsuranceModal from './InsuranceModal';

export default function InsuranceTab() {
  const { t } = useTranslation(['admin', 'common']);
  const [rows, setRows] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState<any | null>(null);
  const [pick, setPick] = useState('');

  const load = useCallback(() => {
    insuranceAPI.list()
      .then(r => { setRows(r.data.policies || []); setCandidates(r.data.candidates || []); setError(''); })
      .catch(() => setError(t('admin:insurance.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);
  // Amounts follow capital, so keep them current while the tab is open.
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const active = rows.filter(r => r.status === 'ACTIVE');
  const totalCapital = active.reduce((s, r) => s + r.capital, 0);
  const totalAmount = active.reduce((s, r) => s + r.expectedAmount, 0);

  const picked = candidates.find(c => c.id === pick);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <div className="pj-error">{error}</div>}

      <div className="admin-grid">
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('admin:insurance.statPolicies')}</p>
          <p className="admin-stat-value">{formatNumber(active.length)}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('admin:insurance.statCapital')}</p>
          <p className="admin-stat-value ltr-embed">{formatEur(totalCapital)}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t('admin:insurance.statAmount')}</p>
          <p className="admin-stat-value ltr-embed" style={{ color: 'var(--green)' }}>{formatEur(totalAmount)}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="filter-select" value={pick} onChange={e => setPick(e.target.value)} style={{ minWidth: 260 }}>
          <option value="">{t('admin:insurance.addPlaceholder')}</option>
          {candidates.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
        </select>
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 18px' }} disabled={!picked}
          onClick={() => { setAdding(picked); setPick(''); }}>
          {t('admin:insurance.addBtn')}
        </button>
      </div>

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>{t('admin:insurance.cols.member')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin:insurance.cols.capital')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin:insurance.cols.rate')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin:insurance.cols.amount')}</th>
              <th>{t('admin:insurance.cols.renewal')}</th>
              <th>{t('admin:insurance.cols.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>{t('common:state.loading')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>{t('admin:insurance.none')}</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={r.status === 'DISABLED' ? { opacity: 0.55 } : undefined}>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {r.member.name}
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{r.member.email}</div>
                </td>
                <td className="ltr-embed" style={{ textAlign: 'right' }}>{formatEur(r.capital)}</td>
                <td className="ltr-embed" style={{ textAlign: 'right' }}>{formatNumber(r.ratePercent)}%</td>
                <td className="amount-credit ltr-embed" style={{ textAlign: 'right' }}>{formatEur(r.expectedAmount)}</td>
                <td>{formatDate(r.renewalDate)}</td>
                <td>
                  <span className={`badge ${r.status === 'ACTIVE' ? 'badge-completed' : 'badge-pending'}`}>
                    {t(`admin:insurance.status.${r.status}`)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(r)}>
                    {t('admin:insurance.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('admin:insurance.footnote')}</p>

      {editing && (
        <InsuranceModal member={{ id: editing.userId, name: editing.member.name }} policy={editing}
          capital={editing.capital} canEdit initialView="edit" onClose={() => setEditing(null)} onDone={load} />
      )}
      {adding && (
        <InsuranceModal member={{ id: adding.id, name: adding.name }} policy={null}
          capital={adding.capital || 0} canEdit onClose={() => setAdding(null)} onDone={load} />
      )}
    </div>
  );
}
