'use client';
// src/app/onboarding/profile/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { mmsAPI } from '@/lib/api';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';

// `value` is what is stored and sent to the API and must stay English: it is
// matched against the directory filters and the admin views. `key` is only for
// display. Translating the stored industry would break member search (§3).
const INDUSTRIES = [
  { value: 'Private Equity', key: 'privateEquity' },
  { value: 'Real Estate',    key: 'realEstate' },
  { value: 'Technology',     key: 'technology' },
  { value: 'Hospitality',    key: 'hospitality' },
  { value: 'Finance',        key: 'finance' },
  { value: 'Family Office',  key: 'familyOffice' },
  { value: 'Healthcare',     key: 'healthcare' },
  { value: 'Energy',         key: 'energy' },
  { value: 'Other',          key: 'other' },
];

export default function OnboardingProfilePage() {
  const { t } = useTranslation(['auth', 'common']);
  const { user, loading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    jobTitle:        '',
    company:         '',
    industry:        '',
    country:         '',
    city:            '',
    phone:           '',
    experienceYears: '',
    bio:             '',
    linkedIn:        '',
  });
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // Already active - skip onboarding
    if (user.status === 'ACTIVE') { router.replace('/dashboard'); return; }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.jobTitle || !form.company) {
      setError(t('auth:onboarding.profile.required'));
      return;
    }
    setSaving(true);
    try {
      await mmsAPI.submitProfile(form);
      router.push('/onboarding/kyc');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:onboarding.profile.failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="onboarding-page">
      <OnboardingProgress current="profile" />

      <div className="onboarding-card">
        {/* Onboarding happens before approval, so the selector has to be here
            too — this is the only chrome a PENDING member sees (§4). */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSelector variant="panel" />
        </div>

        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <div className="onboarding-brand">{t('common:brand.name')}</div>
          <div className="onboarding-sub">{t('common:brand.subTitle')}</div>
        </div>

        <h1 className="onboarding-title">{t('auth:onboarding.profile.title')}</h1>
        <p className="onboarding-desc">{t('auth:onboarding.profile.desc')}</p>

        <form onSubmit={handleSubmit}>
          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.jobTitleLabel')}</label>
              <input className="comm-form-input" placeholder={t('auth:onboarding.profile.jobTitlePlaceholder')}
                value={form.jobTitle} onChange={set('jobTitle')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.companyLabel')}</label>
              <input className="comm-form-input" placeholder={t('auth:onboarding.profile.companyPlaceholder')}
                value={form.company} onChange={set('company')} required />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.industryLabel')}</label>
              <select className="comm-form-select" value={form.industry} onChange={set('industry')}>
                <option value="">{t('auth:onboarding.profile.industryPlaceholder')}</option>
                {INDUSTRIES.map(i => (
                  <option key={i.value} value={i.value}>{t(`auth:onboarding.industries.${i.key}`)}</option>
                ))}
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.experienceLabel')}</label>
              <input className="comm-form-input" type="number" min="0" max="60"
                placeholder={t('auth:onboarding.profile.experiencePlaceholder')}
                value={form.experienceYears} onChange={set('experienceYears')} />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.countryLabel')}</label>
              <input className="comm-form-input" placeholder={t('auth:onboarding.profile.countryPlaceholder')}
                value={form.country} onChange={set('country')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.cityLabel')}</label>
              <input className="comm-form-input" placeholder={t('auth:onboarding.profile.cityPlaceholder')}
                value={form.city} onChange={set('city')} />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.phoneLabel')}</label>
              {/* Phone numbers and LinkedIn URLs are Latin-script regardless of
                  page direction (§10). */}
              <input className="comm-form-input ltr-embed" dir="ltr" placeholder="+1 234 567 890"
                value={form.phone} onChange={set('phone')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('auth:onboarding.profile.linkedInLabel')}</label>
              <input className="comm-form-input ltr-embed" dir="ltr" placeholder="linkedin.com/in/you"
                value={form.linkedIn} onChange={set('linkedIn')} />
            </div>
          </div>

          <div className="comm-form-group">
            <label className="comm-form-label">{t('auth:onboarding.profile.bioLabel')}</label>
            <textarea className="comm-form-input ob-textarea"
              placeholder={t('auth:onboarding.profile.bioPlaceholder')}
              value={form.bio}
              onChange={set('bio') as any}
              rows={4}
            />
          </div>

          {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

          <button
            type="submit"
            className="comm-btn comm-btn-gold"
            style={{ width: '100%', padding: '13px', marginTop: 4 }}
            disabled={saving}
          >
            {saving ? t('auth:onboarding.profile.submitting') : t('auth:onboarding.profile.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
