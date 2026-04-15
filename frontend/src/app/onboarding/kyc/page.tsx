'use client';
// src/app/onboarding/kyc/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { mmsAPI } from '@/lib/api';

type DocSlot = { file: File | null; type: string };

export default function OnboardingKycPage() {
  const { user, loading, refresh } = useAuth();
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
      setError('Please upload at least one document.');
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
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="onboarding-page">
      {/* Progress */}
      <div className="onboarding-progress">
        <div className="ob-step ob-step--done">1 Register</div>
        <div className="ob-step-line ob-step-line--done" />
        <div className="ob-step ob-step--done">2 Profile</div>
        <div className="ob-step-line ob-step-line--done" />
        <div className="ob-step ob-step--active">3 KYC</div>
        <div className="ob-step-line" />
        <div className="ob-step">4 Review</div>
      </div>

      <div className="onboarding-card">
        <div className="onboarding-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC" />
          <div className="onboarding-brand">TRILLION</div>
          <div className="onboarding-sub">Business Community</div>
        </div>

        <h1 className="onboarding-title">Identity Verification</h1>
        <p className="onboarding-desc">
          Upload your identification and business documents for KYC verification.
          Accepted formats: JPG, PNG, PDF (max 10 MB each).
        </p>

        <form onSubmit={handleSubmit}>
          {docs.map((doc, idx) => (
            <div key={idx} className="kyc-doc-slot">
              <div className="ob-row" style={{ alignItems: 'flex-end' }}>
                <div className="comm-form-group" style={{ flex: 1 }}>
                  <label className="comm-form-label">Document Type</label>
                  <select className="comm-form-select"
                    value={doc.type} onChange={e => setType(idx, e.target.value)}>
                    <option value="id_proof">ID Proof (Passport / National ID)</option>
                    <option value="business_proof">Business Proof (Registration / License)</option>
                    <option value="address_proof">Address Proof (Utility Bill)</option>
                  </select>
                </div>
                <div className="comm-form-group" style={{ flex: 2 }}>
                  <label className="comm-form-label">
                    {idx === 0 ? 'Document *' : 'Additional Document (optional)'}
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
                  ✓ {doc.file.name}
                </p>
              )}
            </div>
          ))}

          <div style={{ marginTop: 4, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              All documents are stored securely and used solely for membership verification.
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
              ← Back
            </button>
            <button
              type="submit"
              className="comm-btn comm-btn-gold"
              style={{ flex: 2, padding: '13px' }}
              disabled={submitting}
            >
              {submitting ? 'Uploading…' : 'Submit for Review →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
