'use client';
// src/app/register/page.tsx
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [form, setForm] = useState({
    name:     '',
    email:    '',
    password: '',
    confirm:  '',
    company:  '',
    industry: '',
    country:  '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(form.name, form.email, form.password, {
        company:  form.company,
        industry: form.industry,
        country:  form.country,
      });
      // Log in, then go to onboarding profile step
      await login(form.email, form.password);
      router.push('/onboarding/profile');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-register-page">
      <div className="comm-register-card">
        {/* Logo */}
        <div className="comm-register-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC" />
          <div className="comm-register-brand">TRILLION</div>
          <div className="comm-register-sub">Business Community</div>
        </div>

        <h1 className="comm-register-title">Join the Circle</h1>
        <p className="comm-register-desc">Create your member account to access the community.</p>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div className="comm-form-group">
            <label className="comm-form-label">Full Name *</label>
            <input className="comm-form-input" type="text" placeholder="Your full name"
              value={form.name} onChange={set('name')} required />
          </div>

          {/* Email */}
          <div className="comm-form-group">
            <label className="comm-form-label">Email Address *</label>
            <input className="comm-form-input" type="email" placeholder="you@example.com"
              value={form.email} onChange={set('email')} required />
          </div>

          {/* Passwords */}
          <div className="comm-register-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Password *</label>
              <input className="comm-form-input" type="password" placeholder="Min 8 characters"
                value={form.password} onChange={set('password')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Confirm *</label>
              <input className="comm-form-input" type="password" placeholder="Repeat password"
                value={form.confirm} onChange={set('confirm')} required />
            </div>
          </div>

          {/* Optional fields */}
          <div className="comm-register-row">
            <div className="comm-form-group">
              <label className="comm-form-label">Company</label>
              <input className="comm-form-input" type="text" placeholder="Your company"
                value={form.company} onChange={set('company')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Country</label>
              <input className="comm-form-input" type="text" placeholder="Your country"
                value={form.country} onChange={set('country')} />
            </div>
          </div>

          <div className="comm-form-group">
            <label className="comm-form-label">Industry</label>
            <select className="comm-form-select" value={form.industry} onChange={set('industry')}>
              <option value="">Select industry</option>
              <option value="Private Equity">Private Equity</option>
              <option value="Real Estate">Real Estate</option>
              <option value="Technology">Technology</option>
              <option value="Hospitality">Hospitality</option>
              <option value="Finance">Finance &amp; Banking</option>
              <option value="Family Office">Family Office</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Energy">Energy</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {error && (
            <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>
          )}

          <button
            type="submit"
            className="comm-btn comm-btn-gold"
            style={{ width: '100%', padding: '13px', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Apply for Membership'}
          </button>
        </form>

        <div className="comm-register-login">
          Already a member?{' '}
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
