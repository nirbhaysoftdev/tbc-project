'use client';
// src/app/dashboard/page.tsx
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { dashboardAPI, formatEur, formatDate } from '@/lib/api';
import DebitCard from '@/components/cards/DebitCard';
import WithdrawModal from '@/components/withdraw/WithdrawModal';

// Import chart dynamically (no SSR) because Chart.js needs window
const BalanceChart = dynamic(() => import('@/components/charts/BalanceChart'), { ssr: false });

const PERIODS = ['1M','3M','6M','1Y','All'];

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  const [summary,   setSummary]   = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [period,    setPeriod]    = useState('1Y');
  const [loading,   setLoading]   = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    dashboardAPI.getSummary().then(r => {
      setSummary(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    dashboardAPI.getChart(period).then(r => setChartData(r.data.chartData || []));
  }, [period]);

  const wallet = summary?.wallet;
  const byProject = summary?.byProject || [];
  const firstName =
    summary?.user?.name?.split(' ')[0] ||
    user?.name?.split(' ')[0] ||
    t('dashboard:memberFallback');

  return (
    <div className="content-left">
      {/* Welcome row */}
      <div className="welcome-row">
        <h1 className="welcome-title">{t('dashboard:welcome', { name: firstName })}</h1>
       <div className="welcome-balance">
  <button
    onClick={() => setShowWithdraw(true)}
    style={{
      padding: '10px 20px',
      background: 'rgba(224,82,82,0.15)',
      border: '1px solid rgba(224,82,82,0.3)',
      borderRadius: 'var(--radius-sm)',
      color: 'var(--red)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7-7 7 7"/>
    </svg>
    {t('dashboard:withdraw.cta')}
  </button>
</div>
      </div>

      {/* Balance card */}
      <div className="balance-card">
        {/* Chart section */}
        <div className="balance-chart-section">
          <p className="balance-label">{t('dashboard:balance.label')}</p>
          <p className="balance-amount">
            {wallet ? formatEur(wallet.totalBalance) : t('dashboard:balance.placeholder')}
          </p>

          <div className="chart-wrap">
            {chartData.length > 0 ? (
              <BalanceChart data={chartData} />
            ) : (
              <div style={{ height: '100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div className="spinner" style={{ width:28, height:28, borderWidth:2, margin:0 }} />
              </div>
            )}
          </div>

          <div className="chart-period-tabs">
            {PERIODS.map(p => (
              // `p` is the API's period parameter and stays English; only the
              // button label is translated.
              <button key={p} className={`period-tab ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}>
                {t(`dashboard:periods.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="balance-stats">
          <div className="stat-card invest">
            <p className="stat-label">{t('dashboard:balance.investedCapital')}</p>
            <p className="stat-value">{wallet ? formatEur(wallet.investedCapital) : t('dashboard:balance.placeholder')}</p>
          </div>
          <div className="stat-card profit">
            <p className="stat-label">{t('dashboard:balance.availableProfit')}</p>
            <p className="stat-value">{wallet ? formatEur(wallet.availableProfit) : t('dashboard:balance.placeholder')}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{t('dashboard:balance.pendingWithdrawal')}</p>
            <p className="stat-value">{wallet ? formatEur(wallet.pendingWithdrawal) : t('dashboard:balance.placeholder')}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{t('dashboard:balance.withdrawnProfit')}</p>
            <p className="stat-value">{wallet ? formatEur(wallet.withdrawnProfit) : t('dashboard:balance.placeholder')}</p>
          </div>
        </div>
      </div>

      {/* Project-wise capital and profit */}
      {byProject.length > 0 && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
            <p style={{ fontWeight:700, fontSize:14 }}>{t('dashboard:byProject.title')}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              {t('dashboard:byProject.note')}
            </p>
          </div>
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('dashboard:byProject.project')}</th>
                <th>{t('dashboard:byProject.capital')}</th>
                <th>{t('dashboard:byProject.profit')}</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((row: any) => (
                <tr key={row.projectId || 'no-project'}>
                  {/* The project title arrives already translated by the API
                      (Accept-Language -> translation store -> English
                      fallback), so nothing is translated client-side here. */}
                  <td style={{ fontWeight:600, color:'var(--text-primary)' }}>
                    {row.projectTitle || t('dashboard:byProject.noProject')}
                  </td>
                  <td>{formatEur(row.capital)}</td>
                  <td className="amount-credit">{formatEur(row.profit)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight:700, color:'var(--text-primary)' }}>{t('common:label.total')}</td>
                <td style={{ fontWeight:700 }}>{formatEur(byProject.reduce((s: number, r: any) => s + r.capital, 0))}</td>
                <td style={{ fontWeight:700 }} className="amount-credit">
                  {formatEur(byProject.reduce((s: number, r: any) => s + r.profit, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Card section */}
      <div className="card-section">
        {/* Apple Pay */}
        <div className="apple-pay-badge">
          <svg viewBox="0 0 814 1000" width="18" height="18" fill="white">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-36.8-155.5-103.4C157.1 793.7 95 672.4 95 555.5c0-176 114.2-276.5 231.6-276.5 61.2 0 112.1 40.2 150.2 40.2 36.4 0 93.8-42.5 163.1-42.5 26.3 0 108.3 2.6 168.4 80.8zm-203.3-159.8c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
          </svg>
          <span>{t('dashboard:cards.applePay')}</span>
        </div>

        {/* Debit Card */}
        <DebitCard name={summary?.user?.name || user?.name || ''} />
      </div>

      {/* Recent transactions preview */}
      {summary?.recentTransactions?.length > 0 && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontWeight:700, fontSize:14 }}>{t('dashboard:recent.title')}</p>
            <a href="/transactions" style={{ fontSize:12, color:'var(--accent-blue)', fontWeight:600 }}>{t('dashboard:recent.viewAll')}</a>
          </div>
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('dashboard:transactions.columns.date')}</th>
                <th>{t('dashboard:transactions.columns.description')}</th>
                <th>{t('dashboard:transactions.columns.type')}</th>
                <th>{t('dashboard:transactions.columns.amount')}</th>
                <th>{t('dashboard:transactions.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentTransactions.map((tx: any) => (
                <tr key={tx.id}>
                  {/* formatDate replaces a hardcoded 'en-GB' locale, so the
                      date format follows the chosen language. */}
                  <td>{formatDate(tx.createdAt)}</td>
                  <td>{tx.description}</td>
                  <td>
                    {/* The CLASS keeps the raw enum (badge-credit / badge-debit);
                        only the visible label is translated. */}
                    <span className={`badge badge-${tx.type.toLowerCase()}`}>
                      {t(`dashboard:transactions.type.${tx.type}`)}
                    </span>
                  </td>
                  <td className={tx.type === 'CREDIT' ? 'amount-credit' : 'amount-debit'}>
                    <span className="ltr-embed">
                      {tx.type === 'CREDIT' ? '+' : '-'}{formatEur(tx.amount)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${tx.status.toLowerCase()}`}>
                      {t(`dashboard:transactions.txStatus.${tx.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      
{/* Withdraw Modal */}
      {showWithdraw && (
        <WithdrawModal
          balance={wallet?.availableProfit || 0}
          userName={summary?.user?.name || user?.name || ''}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            // refresh summary
            dashboardAPI.getSummary().then(r => setSummary(r.data));
          }}
        />
      )}
    </div>
  );
}
