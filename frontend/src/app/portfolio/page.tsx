'use client';
// src/app/portfolio/page.tsx
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { formatEur } from '@/lib/api';

function PortfolioContent() {
  const { t } = useTranslation('dashboard');
  const { user } = useAuth();
  const wallet   = (user as any)?.wallet;

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">{t('portfolio.title')}</h1>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, marginBottom:24 }}>
        {[
          { key:'investment',   label: t('portfolio.investment'),   value: formatEur(wallet?.investmentAmount || 0), color:'var(--accent-blue)' },
          { key:'profit',       label: t('portfolio.profit'),       value: formatEur(wallet?.profitAmount     || 0), color:'var(--green)' },
          { key:'totalBalance', label: t('portfolio.totalBalance'), value: formatEur(wallet?.totalBalance     || 0), color:'var(--accent-gold)' },
          // { label:'ROI',           value: wallet?.investmentAmount > 0
          //     ? `+${((wallet.profitAmount / wallet.investmentAmount)*100).toFixed(1)}%` : '0%',
          //   color: 'var(--green)' },
        ].map(({ key, label, value, color }) => (
          // Keyed by the stable key, not the translated label.
          <div key={key} className="admin-stat-card">
            <p className="admin-stat-label">{label}</p>
            <p className="admin-stat-value ltr-embed" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:28, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
        <p style={{ marginBottom:8, fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>{t('portfolio.analyticsTitle')}</p>
        <p>{t('portfolio.analyticsNote')}</p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <ProtectedLayout>
      <PortfolioContent />
    </ProtectedLayout>
  );
}
