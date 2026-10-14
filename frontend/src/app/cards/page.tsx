'use client';
// src/app/cards/page.tsx
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import DebitCard from '@/components/cards/DebitCard';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';

function CardsContent() {
  const { t } = useTranslation('dashboard');
  const { user } = useAuth();
  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">{t('cards.pageTitle')}</h1>
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
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{t('cards.cardTitle')}</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'status',       label: t('cards.cardStatus'),  value: t('cards.statusActive'), green: true },
              { key: 'type',         label: t('cards.cardType'),    value: t('cards.typeValue') },
              // A masked card number is a value, not language: never translated
              // and always rendered LTR (§10).
              { key: 'number',       label: t('cards.cardNumber'),  value: '**** **** **** 3456', ltr: true },
              { key: 'network',      label: t('cards.network'),     value: t('cards.networkValue') },
              { key: 'contactless',  label: t('cards.contactless'), value: t('cards.enabled') },
            ].map(({ key, label, value, green, ltr }) => (
              <div key={key} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>{label}</span>
                <span className={ltr ? 'ltr-embed' : undefined} style={{ fontSize:13, fontWeight:600, color: green ? 'var(--green)' : 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{t('cards.benefitsTitle')}</p>
            {(['priorityPass', 'concierge', 'rewards'] as const).map(b => (
              <div key={b} className="benefit-item" style={{ marginBottom: 10 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" className="check-icon" fill="none" stroke="#4fc8e8" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(`cards.benefits.${b}`)}</span>
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
    <ProtectedLayout>
      <CardsContent />
    </ProtectedLayout>
  );
}
