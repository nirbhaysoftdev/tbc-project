'use client';
// src/app/portfolio/page.tsx
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { formatEur } from '@/lib/api';

function PortfolioContent() {
  const { user } = useAuth();
  const wallet   = (user as any)?.wallet;

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Portfolio</h1>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16, marginBottom:24 }}>
        {[
          { label:'Investment',    value: formatEur(wallet?.investmentAmount || 0), color:'var(--accent-blue)' },
          { label:'Profit',        value: formatEur(wallet?.profitAmount     || 0), color:'var(--green)' },
          { label:'Total Balance', value: formatEur(wallet?.totalBalance     || 0), color:'var(--accent-gold)' },
          { label:'ROI',           value: wallet?.investmentAmount > 0
              ? `+${((wallet.profitAmount / wallet.investmentAmount)*100).toFixed(1)}%` : '0%',
            color: 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="admin-stat-card">
            <p className="admin-stat-label">{label}</p>
            <p className="admin-stat-value" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:28, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
        <p style={{ marginBottom:8, fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>Detailed Portfolio Analytics</p>
        <p>Donut chart (capital allocation) and monthly profit bar chart coming in Phase 2.</p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <AuthProvider>
      <ProtectedLayout>
        <PortfolioContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
