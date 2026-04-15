'use client';
// src/app/onboarding/pending/page.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function OnboardingPendingPage() {
  const { user, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // If admin already approved — go straight to dashboard
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
      {/* Progress */}
      <div className="onboarding-progress">
        <div className="ob-step ob-step--done">1 Register</div>
        <div className="ob-step-line ob-step-line--done" />
        <div className="ob-step ob-step--done">2 Profile</div>
        <div className="ob-step-line ob-step-line--done" />
        <div className={`ob-step ${stepsDone >= 3 ? 'ob-step--done' : 'ob-step--active'}`}>3 KYC</div>
        <div className={`ob-step-line ${stepsDone >= 3 ? 'ob-step-line--done' : ''}`} />
        <div className={`ob-step ${user.status === 'ACTIVE' ? 'ob-step--done' : 'ob-step--active'}`}>
          4 Review
        </div>
      </div>

      <div className="onboarding-card" style={{ maxWidth: 520, textAlign: 'center' }}>
        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC" />
          <div className="onboarding-brand">TRILLION</div>
          <div className="onboarding-sub">Business Community</div>
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

        <h1 className="onboarding-title" style={{ fontSize: 22 }}>Application Under Review</h1>

        {!kycSubmitted ? (
          <>
            <p className="onboarding-desc" style={{ color: 'var(--accent-gold)', marginBottom: 24 }}>
              You haven&apos;t uploaded your KYC documents yet.
            </p>
            <button
              className="comm-btn comm-btn-gold"
              style={{ width: '100%', padding: '13px', marginBottom: 16 }}
              onClick={() => router.push('/onboarding/kyc')}
            >
              Upload KYC Documents →
            </button>
          </>
        ) : (
          <p className="onboarding-desc" style={{ lineHeight: 1.7, marginBottom: 24 }}>
            Your profile and KYC documents have been submitted. Our team will review your
            application within <strong style={{ color: 'var(--text-primary)' }}>2–5 business days</strong>.
            You will receive access to the full platform once your membership is approved.
          </p>
        )}

        {/* Status chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
          {[
            { label: 'Account Created',       done: true },
            { label: 'Profile Completed',      done: true },
            { label: 'KYC Documents Uploaded', done: kycSubmitted },
            { label: 'Admin Approval',         done: user.status === 'ACTIVE' },
          ].map(step => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                {step.label}
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
          {checking ? 'Checking…' : 'Check Approval Status'}
        </button>

        <button
          onClick={logout}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
