'use client';
// src/app/cards/page.tsx
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import DebitCard from '@/components/cards/DebitCard';
import { useAuth } from '@/lib/auth';

function CardsContent() {
  const { user } = useAuth();
  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">My Cards</h1>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 32,
        display: 'flex',
        gap: 40,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        <DebitCard name={user?.name || ''} />

        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>TBC Platinum Debit Card</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Card Status',  value: 'Active', green: true },
              { label: 'Card Type',    value: 'Debit – Mastercard' },
              { label: 'Card Number',  value: '**** **** **** 3456' },
              { label: 'Network',      value: 'Mastercard International' },
              { label: 'Contactless',  value: 'Enabled' },
            ].map(({ label, value, green }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize:13, fontWeight:600, color: green ? 'var(--green)' : 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Mastercard Benefits</p>
            {['Priority Pass Membership', '24/7 Concierge Assistance', 'Exclusive Rewards and Perks'].map(b => (
              <div key={b} className="benefit-item" style={{ marginBottom: 10 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" className="check-icon" fill="none" stroke="#4fc8e8" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardsPage() {
  return (
    <AuthProvider>
      <ProtectedLayout>
        <CardsContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
