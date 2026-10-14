'use client';
// src/components/admin/InvestmentsTab.tsx
//
// Admin "Project Investments" tab: project overview cards, a filterable
// ledger of investments (capital) and profit records, and the entry point
// into the new Investment/Profit wizard.
import { useEffect, useState } from 'react';
import { investmentAPI, formatEur, formatDate, formatNumber } from '@/lib/api';
import InvestmentWizard from './InvestmentWizard';
import { useTranslation } from 'react-i18next';

interface Member { id: string; name: string; email: string; }

export default function InvestmentsTab({ members }: { members: Member[] }) {
  const { t } = useTranslation(['admin', 'common']);
  const [projects, setProjects] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [profitRecords, setProfitRecords] = useState<any[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [view, setView] = useState<'investments' | 'profit'>('investments');

  const load = () => {
    setLoading(true);
    const params = projectFilter ? { projectId: projectFilter } : undefined;
    return Promise.all([
      investmentAPI.listProjects().then(r => setProjects(r.data.projects || [])),
      investmentAPI.listInvestments(params).then(r => setInvestments(r.data.investments || [])),
      investmentAPI.listProfitRecords(params).then(r => setProfitRecords(r.data.records || [])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectFilter]);

  const statusBadgeClass = (status: string) =>
    status === 'ACTIVE' ? 'badge-completed' :
    status === 'COMPLETED' ? 'badge-completed' :
    status === 'PENDING' ? 'badge-pending' : 'badge-failed';

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>
          Capital booked against Deal Room projects and the profit generated on it. Profit never compounds into capital.
        </p>
        <button className="btn-primary" style={{ width:'auto', padding:'8px 20px', fontSize:13 }}
          onClick={() => setShowWizard(true)}>
          + Add Investment / Profit
        </button>
      </div>

      {/* ── Project cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12, marginBottom:20 }}>
        {projects.length === 0 && !loading && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:13 }}>
            No Deal Room projects yet. Create one in the Deal Room to book capital against it.
          </div>
        )}
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => setProjectFilter(f => f === p.id ? '' : p.id)}
            className="admin-stat-card"
            style={{
              textAlign:'left', cursor:'pointer',
              borderColor: projectFilter === p.id ? 'var(--accent-blue)' : undefined,
              background: projectFilter === p.id ? 'rgba(58,111,255,0.08)' : undefined,
            }}>
            <p className="admin-stat-label">{p.name}</p>
            <p className="admin-stat-value">{formatEur(p.totalCapital || 0)}</p>
            <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
              {t('admin:investments.investorsCount', { count: p.investorCount || 0 })}
            </p>
          </button>
        ))}
      </div>

      {projectFilter && (
        <div style={{ marginBottom:12 }}>
          <button className="btn-secondary" style={{ width:'auto', padding:'6px 14px', fontSize:12 }}
            onClick={() => setProjectFilter('')}>
            {t('admin:investments.clearProjectFilter')}
          </button>
        </div>
      )}

      {/* ── Sub-tab: investments / profit ── */}
      <div style={{ display:'flex', gap:4, marginBottom:12 }}>
        {(['investments', 'profit'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{
              padding:'7px 16px', fontSize:12, fontWeight:600, borderRadius:6, cursor:'pointer',
              border: view === v ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
              background: view === v ? 'rgba(58,111,255,0.1)' : 'transparent',
              color: view === v ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}>
            {v === 'investments' ? t('admin:investments.viewInvestments') : t('admin:investments.viewProfit')}
          </button>
        ))}
      </div>

      {view === 'investments' && (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('admin:investments.cols.user')}</th>
                <th>{t('admin:investments.cols.project')}</th>
                <th>{t('admin:investments.cols.amount')}</th>
                <th>{t('admin:investments.cols.investedDate')}</th>
                <th>{t('admin:investments.cols.status')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  {loading ? t('common:state.loading') : t('admin:investments.noneRecorded')}
                </td></tr>
              ) : investments.map((inv: any) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{inv.user?.name}</td>
                  {/* The project TITLE arrives already localised from the API. */}
                  <td>{inv.project?.title || <span style={{ color:'var(--text-muted)' }}>{t('admin:investments.noProject')}</span>}</td>
                  <td className="ltr-embed">
                    {formatEur(inv.amount)}
                    {inv.returnedAmount > 0 && (
                      <span style={{ fontSize:11, color:'var(--text-muted)', display:'block' }}>
                        {t('admin:investments.returnedAmount', { amount: formatEur(inv.returnedAmount) })}
                      </span>
                    )}
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{formatDate(inv.investedAt)}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass(inv.status)}`}>
                      {t(`common:status.${inv.status.toLowerCase()}`, { defaultValue: inv.status })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'profit' && (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('admin:investments.cols.user')}</th>
                <th>{t('admin:investments.cols.project')}</th>
                <th>{t('admin:investments.cols.type')}</th>
                <th>{t('admin:investments.cols.period')}</th>
                <th>{t('admin:investments.cols.rate')}</th>
                <th>{t('admin:investments.cols.capitalUsed')}</th>
                <th>{t('admin:investments.cols.amount')}</th>
                <th>{t('admin:investments.cols.generated')}</th>
              </tr>
            </thead>
            <tbody>
              {profitRecords.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  {loading ? t('common:state.loading') : t('admin:investments.noProfitRecords')}
                </td></tr>
              ) : profitRecords.map((rec: any) => (
                <tr key={rec.id}>
                  <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{rec.user?.name}</td>
                  <td>{rec.project?.title || <span style={{ color:'var(--text-muted)' }}>{t('admin:investments.noProject')}</span>}</td>
                  <td>
                    <span className={`badge ${rec.type === 'MONTHLY' ? 'badge-pending' : 'badge-completed'}`}>
                      {rec.type === 'MONTHLY' ? t('admin:investments.typeMonthly') : t('admin:investments.typeOneTime')}
                    </span>
                  </td>
                  <td style={{ fontSize:12, color:'var(--text-muted)' }}>{rec.period.startsWith('ONE_TIME') ? '-' : rec.period}</td>
                  <td className="ltr-embed">{rec.rate != null ? `${formatNumber(rec.rate)}%` : '-'}</td>
                  <td className="ltr-embed">{formatEur(rec.capitalSnapshot)}</td>
                  <td className="amount-credit ltr-embed">+{formatEur(rec.amount)}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{formatDate(rec.generatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InvestmentWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        members={members}
        onSuccess={load}
      />
    </div>
  );
}
