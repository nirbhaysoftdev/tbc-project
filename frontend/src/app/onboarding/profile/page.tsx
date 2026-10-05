'use client';
// src/app/onboarding/profile/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { mmsAPI } from '@/lib/api';

const INDUSTRIES = [
  'Private Equity', 'Real Estate', 'Technology', 'Hospitality',
  'Finance', 'Family Office', 'Healthcare', 'Energy', 'Other',
];

export default function OnboardingProfilePage() {
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
      setError('Job title and company are required.');
      return;
    }
    setSaving(true);
    try {
      await mmsAPI.submitProfile(form);
      router.push('/onboarding/kyc');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="onboarding-page">
      {/* Progress bar */}
      <div className="onboarding-progress">
        <div className="ob-step ob-step--done">1 Register</div>
        <div className="ob-step-line ob-step-line--done" />
        <div className="ob-step ob-step--active">2 Profile</div>
        <div className="ob-step-line" />
        <div className="ob-step">3 KYC</div>
        <div className="ob-step-line" />
        <div className="ob-step">4 Review</div>
      </div>

      <div className="onboarding-card">
        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC" />
          <div className="onboarding-brand">TRILLION</div>
          <div className="onboarding-sub">Business Community</div>
        </div>

        <h1 className="onboarding-title">Complete Your Profile</h1>
        <p className="onboarding-desc">
          Tell us about yourself so our team can verify your membership.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Job Title *</label>
              <input className="comm-form-input" placeholder="e.g. Managing Director"
                value={form.jobTitle} onChange={set('jobTitle')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Company *</label>
              <input className="comm-form-input" placeholder="Your company name"
                value={form.company} onChange={set('company')} required />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Industry</label>
              <select className="comm-form-select" value={form.industry} onChange={set('industry')}>
                <option value="">Select industry</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Years of Experience</label>
              <input className="comm-form-input" type="number" min="0" max="60"
                placeholder="e.g. 10" value={form.experienceYears} onChange={set('experienceYears')} />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Country</label>
              <input className="comm-form-input" placeholder="Your country"
                value={form.country} onChange={set('country')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">City</label>
              <input className="comm-form-input" placeholder="Your city"
                value={form.city} onChange={set('city')} />
            </div>
          </div>

          <div className="ob-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Phone</label>
              <input className="comm-form-input" placeholder="+1 234 567 890"
                value={form.phone} onChange={set('phone')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">LinkedIn</label>
              <input className="comm-form-input" placeholder="linkedin.com/in/you"
                value={form.linkedIn} onChange={set('linkedIn')} />
            </div>
          </div>

          <div className="comm-form-group">
            <label className="comm-form-label">Short Bio</label>
            <textarea className="comm-form-input ob-textarea"
              placeholder="Briefly describe your background and investment interests…"
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
            {saving ? 'Saving…' : 'Save & Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
