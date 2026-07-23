'use client';
// src/app/login/page.tsx
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';
import { useGoogleSignIn } from '@/lib/useGoogleSignIn';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login, applyToken } = useAuth();
  const router    = useRouter();

  const routeAfterAuth = (user: { status?: string }, needsAccountType?: boolean) => {
    if (user?.status === 'PENDING') return '/onboarding/pending';
    if (needsAccountType) return '/onboarding/profile';
    return '/community';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      router.push(routeAfterAuth(u));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.google(credential);
      const { token, user, needsAccountType } = res.data;
      await applyToken(token, user);
      router.push(routeAfterAuth(user, needsAccountType));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };
  const { buttonRef, ready: googleReady, unavailable: googleUnavailable } =
    useGoogleSignIn(handleGoogleCredential);

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
             <img src="/images/tbc-logo-1.png" alt="TBC Logo" />
          <p className="login-brand">TRILLION</p>
          <p className="login-sub">BUSINESS COMMUNITY</p>
        </div>

        <h1 className="login-title">Welcome back</h1>
        <p className="login-desc">Sign in to your member dashboard</p>

        {/* Google Sign-in */}
        <div className="comm-google-wrap">
          {googleUnavailable ? (
            <button
              type="button"
              className="comm-google-fallback"
              onClick={() =>
                setError(
                  'Google sign-in is not configured yet. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and try again.',
                )
              }
            >
              <GoogleIcon /> Continue with Google
            </button>
          ) : (
            <div ref={buttonRef} className="comm-google-btn" aria-busy={!googleReady} />
          )}
          <div className="comm-divider"><span>or sign in with email</span></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">EMAIL ADDRESS</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@trillionbc.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">PASSWORD</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-muted)' }}>
          Not a member?{' '}
          <Link href="/register" style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.9c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.3z"/>
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9C3.9 20.6 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.8 13.9c-.3-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3V6.4H2.1C1.4 7.9 1 9.6 1 11.6s.4 3.7 1.1 5.2l3.7-2.9z"/>
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.5 2.2 15 1.2 12 1.2 7.7 1.2 3.9 3.6 2.1 7l3.7 2.9c.9-2.7 3.3-4.5 6.2-4.5z"/>
    </svg>
  );
}
