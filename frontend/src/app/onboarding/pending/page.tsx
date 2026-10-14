'use client';
// src/app/onboarding/pending/page.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';

export default function OnboardingPendingPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { user, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // If admin already approved - go straight to dashboard
    if (user.status === 'ACTIVE') { router.replace('/dashboard'); return; }
  }, [user, loading, router]);

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      await refresh();
      if (user?.status === 'ACTIVE') {
        router.replace('/dashboard');
      }
    } finally {
      setChecking(false);
    }
  };

  if (loading || !user) return null;

  const kycSubmitted = user.kycStatus !== 'NOT_SUBMITTED';
  const stepsDone    = kycSubmitted ? 3 : 2;

  return (
    <div className="onboarding-page">
      <OnboardingProgress
        current={stepsDone >= 3 ? 'review' : 'kyc'}
        done={user.status === 'ACTIVE' ? ['review'] : []}
      />

      <div className="onboarding-card" style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSelector variant="panel" />
        </div>

        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <div className="onboarding-brand">{t('common:brand.name')}</div>
          <div className="onboarding-sub">{t('common:brand.subTitle')}</div>
        </div>

        {/* Pending icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(200,168,75,0.12)',
          border: '2px solid rgba(200,168,75,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none"
            stroke="#c8a84b" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        <h1 className="onboarding-title" style={{ fontSize: 22 }}>{t('auth:onboarding.pending.title')}</h1>

        {!kycSubmitted ? (
          <>
            <p className="onboarding-desc" style={{ color: 'var(--accent-gold)', marginBottom: 24 }}>
              {t('auth:onboarding.pending.noKyc')}
            </p>
            <button
              className="comm-btn comm-btn-gold"
              style={{ width: '100%', padding: '13px', marginBottom: 16 }}
              onClick={() => router.push('/onboarding/kyc')}
            >
              {t('auth:onboarding.pending.uploadKyc')}
            </button>
          </>
        ) : (
          <p className="onboarding-desc" style={{ lineHeight: 1.7, marginBottom: 24 }}>
            <Trans
              i18nKey="auth:onboarding.pending.submitted"
              components={[
                <span key="0" />,
                <strong key="1" style={{ color: 'var(--text-primary)' }} />,
              ]}
            />
          </p>
        )}

        {/* Status chips */}
        {/* `start` rather than `left`: the checklist reads from the correct
            edge in Persian and Arabic (§10). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'start' }}>
          {[
            { key: 'accountCreated',   done: true },
            { key: 'profileCompleted', done: true },
            { key: 'kycUploaded',      done: kycSubmitted },
            { key: 'adminApproval',    done: user.status === 'ACTIVE' },
          ].map(step => (
            // Keyed by the stable key, not the translated label.
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: step.done ? 'rgba(76,217,138,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${step.done ? 'var(--green)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {step.done && (
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                    stroke="var(--green)" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 13, color: step.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {t(`auth:onboarding.pending.checklist.${step.key}`)}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handleCheckStatus}
          disabled={checking}
          className="comm-btn"
          style={{
            width: '100%', padding: '11px',
            background: 'rgba(58,111,255,0.1)',
            border: '1px solid rgba(58,111,255,0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-blue)',
            fontSize: 13, fontWeight: 600, marginBottom: 12,
          }}
        >
          {checking ? t('auth:onboarding.pending.checking') : t('auth:onboarding.pending.checkStatus')}
        </button>

        <button
          onClick={logout}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {t('auth:onboarding.pending.signOut')}
        </button>
      </div>
    </div>
  );
}
