'use client';
// src/app/forgot-password/page.tsx
// Forgot Password -> Enter Email -> Send OTP -> Verify OTP + Set New Password -> Login
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import { authAPI } from '@/lib/api';
import LanguageSelector from '@/components/i18n/LanguageSelector';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['auth', 'common', 'validation']);
  const [step, setStep]         = useState<Step>('email');
  const [email, setEmail]       = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const onOtpChange = (idx: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(0, 1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) {
      const nextInput = document.getElementById(`fp-otp-${idx + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }
  };

  const onOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      const prev = document.getElementById(`fp-otp-${idx - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  };

  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      // Deliberately does not confirm whether the account exists: the
      // endpoint is non-enumerating and the message must stay that way in
      // every language.
      setInfo(t('auth:forgot.codeSentIfExists', { email }));
      setResendIn(60);
      setStep('reset');
    } catch (err: any) {
      // The endpoint is designed to always succeed; this only triggers on
      // rate limiting or a network failure.
      setError(err.response?.data?.error || t('auth:forgot.couldNotSend'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('validation:email'));
    await sendCode();
  };

  const resendCode = async () => {
    if (resendIn > 0) return;
    setInfo('');
    setError('');
    await sendCode();
  };

  const onSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length !== 6) return setError(t('validation:otp.required'));
    if (newPassword.length < 8) return setError(t('validation:password.tooShort', { count: 8 }));
    if (newPassword !== confirm) return setError(t('validation:password.mismatch'));

    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), code, newPassword);
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:forgot.couldNotReset'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Password recovery is a public entry point (§4). */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <LanguageSelector variant="panel" />
        </div>

        <div className="login-logo">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <p className="login-brand">{t('common:brand.name')}</p>
          <p className="login-sub">{t('common:brand.sub')}</p>
        </div>

        {step === 'email' && (
          <>
            <h1 className="login-title">{t('auth:forgot.requestTitle')}</h1>
            <p className="login-desc">{t('auth:forgot.requestDesc')}</p>

            <form onSubmit={onSubmitEmail}>
              <div className="form-group">
                <label className="form-label">{t('auth:forgot.emailLabel')}</label>
                <input
                  type="email"
                  className="form-input"
                  dir="ltr"
                  placeholder={t('auth:login.emailPlaceholder')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('auth:forgot.sending') : t('auth:forgot.send')}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1 className="login-title">{t('auth:forgot.resetTitle')}</h1>
            <p className="login-desc">
              <Trans
                i18nKey="auth:forgot.resetDesc"
                values={{ email }}
                components={[<strong key="0" className="ltr-embed" />]}
              />
            </p>

            <form onSubmit={onSubmitReset}>
              {/* Fixed digit sequence — pinned LTR in every language (§10). */}
              <div className="comm-otp-row ltr-embed" dir="ltr" style={{ marginBottom: 18 }}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    id={`fp-otp-${i}`}
                    className="comm-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={d}
                    onChange={(e) => onOtpChange(i, e.target.value)}
                    onKeyDown={(e) => onOtpKeyDown(i, e)}
                  />
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">{t('auth:forgot.newPasswordLabel')}</label>
                <input
                  type="password"
                  className="form-input"
                  dir="ltr"
                  placeholder={t('auth:forgot.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('auth:forgot.confirmLabel')}</label>
                <input
                  type="password"
                  className="form-input"
                  dir="ltr"
                  placeholder={t('auth:forgot.confirmPlaceholder')}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>

              {info && !error && <p className="form-info">{info}</p>}
              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('auth:forgot.resetting') : t('auth:forgot.reset')}
              </button>

              <div className="comm-otp-resend">
                {resendIn > 0 ? (
                  <span>{t('auth:register.resendIn', { seconds: resendIn })}</span>
                ) : (
                  <button type="button" className="comm-linkish" onClick={resendCode} disabled={loading}>
                    {t('auth:register.resend')}
                  </button>
                )}
                <button
                  type="button"
                  className="comm-linkish"
                  onClick={() => setStep('email')}
                  disabled={loading}
                >
                  {t('auth:register.wrongEmail')}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="login-title">{t('auth:forgot.doneTitle')}</h1>
            <p className="login-desc">{t('auth:forgot.doneDesc')}</p>
            <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              {t('auth:register.goToLogin')}
            </Link>
          </>
        )}

        {step !== 'done' && (
          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('auth:forgot.backToLogin')}{' '}
            <Link href="/login" style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
              {t('auth:register.signIn')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
