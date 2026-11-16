'use client';
// src/app/dashboard/page.tsx
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { dashboardAPI, formatEur } from '@/lib/api';
import WithdrawModal from '@/components/withdraw/WithdrawModal';
import ReturnsCard from '@/components/insurance/ReturnsCard';

// Import chart dynamically (no SSR) because Chart.js needs window
const BalanceChart = dynamic(() => import('@/components/charts/BalanceChart'), { ssr: false });
const AllocationDonut = dynamic(() => import('@/components/charts/AllocationDonut'), { ssr: false });
const MonthlyProfitBars = dynamic(() => import('@/components/charts/MonthlyProfitBars'), { ssr: false });

const PANEL: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden',
};
const PANEL_HEAD: React.CSSProperties = {
  padding: '12px 20px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(20,38,96,0.28)',
};

const PERIODS = ['1M','3M','6M','1Y','All'];

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  const [summary,   setSummary]   = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [period,    setPeriod]    = useState('1Y');
  const [loading,   setLoading]   = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);

  // Profit credited per month (last 12), for the bar chart.
  const [monthlyProfit, setMonthlyProfit] = useState<any[] | null>(null);

  // The figures follow the ledger, so refresh them every 30 seconds while the
  // tab is in view rather than showing what was true when the page opened.
  useEffect(() => {
    const load = () => {
      dashboardAPI.getSummary().then(r => { setSummary(r.data); setLoading(false); }).catch(() => setLoading(false));
      dashboardAPI.getPortfolio().then(r => setMonthlyProfit(r.data.monthlyProfit || [])).catch(() => {});
    };
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    dashboardAPI.getChart(period).then(r => setChartData(r.data.chartData || []));
  }, [period]);

  const wallet = summary?.wallet;
  const byProject = summary?.byProject || [];

  // Capital allocation: every project, then the opening balance, which sits
  // outside any project but is real capital - without it the slices would not
  // add up to the invested capital shown above.
  const allocation = [
    ...byProject.map((r: any) => ({ label: r.projectTitle || t('dashboard:byProject.noProject'), capital: r.capital })),
    ...(wallet?.openingCapital > 0 ? [{ label: t('dashboard:portfolio.openingBalance'), capital: wallet.openingCapital }] : []),
  ];
  const hasCapital = allocation.some((r: any) => r.capital > 0);
  const hasProfit = (monthlyProfit || []).some((p: any) => p.total > 0);
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

      <ReturnsCard />

      {/* Where the capital sits, and the profit received each month. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:20 }}>
        <div style={PANEL}>
          <div style={PANEL_HEAD}>
            <p style={{ fontWeight:700, fontSize:14 }}>{t('dashboard:portfolio.allocationTitle')}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{t('dashboard:portfolio.allocationNote')}</p>
          </div>
          <div style={{ padding:20 }}>
            {!summary ? <div className="spinner" style={{ margin:'24px auto' }} />
              : hasCapital ? <AllocationDonut rows={allocation} totalLabel={t('dashboard:portfolio.investment')} />
              : <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:24 }}>{t('dashboard:portfolio.noCapital')}</p>}
          </div>
        </div>

        <div style={PANEL}>
          <div style={PANEL_HEAD}>
            <p style={{ fontWeight:700, fontSize:14 }}>{t('dashboard:portfolio.profitTitle')}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{t('dashboard:portfolio.profitNote')}</p>
          </div>
          <div style={{ padding:20 }}>
            {monthlyProfit === null ? <div className="spinner" style={{ margin:'24px auto' }} />
              : hasProfit ? (
                <div style={{ height:260 }}>
                  <MonthlyProfitBars series={monthlyProfit} labels={{
                    monthly: t('dashboard:portfolio.typeMonthly'), insurance: t('dashboard:portfolio.typeInsurance'), oneTime: t('dashboard:portfolio.typeOneTime'),
                  }} />
                </div>
              ) : <p style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:24 }}>{t('dashboard:portfolio.noProfit')}</p>}
          </div>
        </div>
      </div>

      {/* Project-wise capital and profit */}
      {byProject.length > 0 && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-md)', boxShadow:'0 10px 30px rgba(0,0,0,0.35)', overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-strong)', background:'rgba(20,38,96,0.28)' }}>
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
