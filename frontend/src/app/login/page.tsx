'use client';
// src/app/login/page.tsx
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';
import { useGoogleSignIn } from '@/lib/useGoogleSignIn';
import LanguageSelector from '@/components/i18n/LanguageSelector';

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login, applyToken, user, loading: authLoading } = useAuth();
  const router    = useRouter();

  const routeAfterAuth = (user: { status?: string }, needsAccountType?: boolean) => {
    if (user?.status === 'PENDING') return '/onboarding/pending';
    if (needsAccountType) return '/onboarding/profile';
    return '/community';
  };

  // Someone already signed in has no business on the sign-in page. Without
  // this, a stray redirect here showed a login form to a member whose session
  // was perfectly valid — they could press Back and carry on, which is what
  // made the whole thing look broken rather than simply wrong.
  //
  // `replace`, not `push`: the login page must not end up in the history of a
  // signed-in session, or Back lands on it again.
  useEffect(() => {
    if (authLoading || !user) return;
    router.replace(user.role === 'ADMIN' ? '/admin' : routeAfterAuth(user));
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      router.push(routeAfterAuth(u));
    } catch (err: any) {
      // A server-sent message is already localised by the API's own
      // Accept-Language handling; only our client-side fallback needs t().
      setError(err.response?.data?.error || t('auth:login.failed'));
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
      setError(err.response?.data?.error || t('auth:google.failed'));
    } finally {
      setLoading(false);
    }
  };
  const { buttonRef, ready: googleReady, unavailable: googleUnavailable } =
    useGoogleSignIn(handleGoogleCredential);

  return (
    <div className="login-page">
      <div className="login-card">
        {/* The selector belongs on the login page itself (§4): a member whose
            UI language differs from their browser must be able to switch
            before authenticating, not after. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <LanguageSelector variant="panel" />
        </div>

        {/* Logo */}
        <div className="login-logo">
             <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <p className="login-brand">{t('common:brand.name')}</p>
          <p className="login-sub">{t('common:brand.sub')}</p>
        </div>

        <h1 className="login-title">{t('auth:login.title')}</h1>
        <p className="login-desc">{t('auth:login.subtitle')}</p>

        {/* Google Sign-in */}
        <div className="comm-google-wrap">
          {googleUnavailable ? (
            <button
              type="button"
              className="comm-google-fallback"
              onClick={() =>
                setError(t('auth:google.notConfigured'))
              }
            >
              <GoogleIcon /> {t('auth:google.continue')}
            </button>
          ) : (
            <div ref={buttonRef} className="comm-google-btn" aria-busy={!googleReady} />
          )}
          <div className="comm-divider"><span>{t('auth:google.dividerSignIn')}</span></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('auth:login.emailLabel')}</label>
            <input
              type="email"
              className="form-input"
              // Email addresses are Latin-script even in Arabic and Persian, so
              // the field keeps LTR input regardless of page direction (§10).
              dir="ltr"
              placeholder={t('auth:login.emailPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth:login.passwordLabel')}</label>
            <input
              type="password"
              className="form-input"
              dir="ltr"
              placeholder={t('auth:login.passwordPlaceholder')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: 14, marginTop: -8 }}>
            <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('auth:login.forgotPassword')}
            </Link>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('auth:login.submitting') : t('auth:login.submit')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('auth:login.notAMember')}{' '}
          <Link href="/register" style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
            {t('auth:login.signUp')}
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
