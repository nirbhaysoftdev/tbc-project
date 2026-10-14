'use client';
// src/app/onboarding/kyc/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import { mmsAPI } from '@/lib/api';

type DocSlot = { file: File | null; type: string };

export default function OnboardingKycPage() {
  const { user, loading, refresh } = useAuth();
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const router = useRouter();

  const [docs, setDocs] = useState<DocSlot[]>([
    { file: null, type: 'id_proof' },
    { file: null, type: 'business_proof' },
  ]);
  const [error,       setError]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.status === 'ACTIVE') { router.replace('/dashboard'); return; }
  }, [user, loading, router]);

  const setDoc = (idx: number, file: File | null) =>
    setDocs(prev => prev.map((d, i) => i === idx ? { ...d, file } : d));

  const setType = (idx: number, type: string) =>
    setDocs(prev => prev.map((d, i) => i === idx ? { ...d, type } : d));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const filled = docs.filter(d => d.file);
    if (filled.length === 0) {
      setError(t('auth:onboarding.kyc.atLeastOne'));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      const types: string[] = [];
      filled.forEach(d => {
        fd.append('documents', d.file!);
        types.push(d.type);
      });
      fd.append('documentTypes', JSON.stringify(types));
      await mmsAPI.submitKyc(fd);
      await refresh();
      router.push('/onboarding/pending');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:onboarding.kyc.uploadFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="onboarding-page">
      <OnboardingProgress current="kyc" />

      <div className="onboarding-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSelector variant="panel" />
        </div>

        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <div className="onboarding-brand">{t('common:brand.name')}</div>
          <div className="onboarding-sub">{t('common:brand.subTitle')}</div>
        </div>

        <h1 className="onboarding-title">{t('auth:onboarding.kyc.title')}</h1>
        <p className="onboarding-desc">{t('auth:onboarding.kyc.desc')}</p>

        <form onSubmit={handleSubmit}>
          {docs.map((doc, idx) => (
            <div key={idx} className="kyc-doc-slot">
              <div className="ob-row" style={{ alignItems: 'flex-end' }}>
                <div className="comm-form-group" style={{ flex: 1 }}>
                  <label className="comm-form-label">{t('auth:onboarding.kyc.documentType')}</label>
                  <select className="comm-form-select"
                    value={doc.type} onChange={e => setType(idx, e.target.value)}>
                    {/* The `value` is the stored document type and stays
                        English — the admin KYC review matches on it. */}
                    <option value="id_proof">{t('auth:onboarding.kyc.types.idProof')}</option>
                    <option value="business_proof">{t('auth:onboarding.kyc.types.businessProof')}</option>
                    <option value="address_proof">{t('auth:onboarding.kyc.types.addressProof')}</option>
                  </select>
                </div>
                <div className="comm-form-group" style={{ flex: 2 }}>
                  <label className="comm-form-label">
                    {idx === 0
                      ? t('auth:onboarding.kyc.documentRequired')
                      : t('auth:onboarding.kyc.documentOptional')}
                  </label>
                  <input
                    type="file"
                    className="comm-form-input"
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    style={{ padding: '9px 12px', cursor: 'pointer' }}
                    onChange={e => setDoc(idx, e.target.files?.[0] ?? null)}
                    required={idx === 0}
                  />
                </div>
              </div>
              {doc.file && (
                <p style={{ fontSize: 12, color: 'var(--green)', marginTop: -6, marginBottom: 8 }}>
                  {t('validation:file.selected', { name: doc.file.name })}
                </p>
              )}
            </div>
          ))}

          <div style={{ marginTop: 4, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('auth:onboarding.kyc.privacyNote')}
            </p>
          </div>

          {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button"
              className="comm-btn"
              style={{
                flex: 1, padding: '13px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: 14, fontWeight: 600,
              }}
              onClick={() => router.push('/onboarding/profile')}
            >
              {t('auth:register.back')}
            </button>
            <button
              type="submit"
              className="comm-btn comm-btn-gold"
              style={{ flex: 2, padding: '13px' }}
              disabled={submitting}
            >
              {submitting ? t('auth:onboarding.kyc.submitting') : t('auth:onboarding.kyc.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
