'use client';
// src/app/forgot-password/page.tsx
// Forgot Password -> Enter Email -> Send OTP -> Verify OTP + Set New Password -> Login
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authAPI } from '@/lib/api';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
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
      setInfo(`If an account exists for ${email}, a 6-digit code has been sent to it.`);
      setResendIn(60);
      setStep('reset');
    } catch (err: any) {
      // The endpoint is designed to always succeed; this only triggers on
      // rate limiting or a network failure.
      setError(err.response?.data?.error || 'Could not send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email');
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
    if (code.length !== 6) return setError('Enter the 6-digit code');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters');
    if (newPassword !== confirm) return setError('Passwords do not match');

    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), code, newPassword);
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC Logo" />
          <p className="login-brand">TRILLION</p>
          <p className="login-sub">BUSINESS COMMUNITY</p>
        </div>

        {step === 'email' && (
          <>
            <h1 className="login-title">Forgot password</h1>
            <p className="login-desc">Enter your account email and we&apos;ll send you a verification code.</p>

            <form onSubmit={onSubmitEmail}>
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

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Sending code…' : 'Send verification code'}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1 className="login-title">Reset password</h1>
            <p className="login-desc">
              Enter the 6-digit code sent to <strong>{email}</strong> and choose a new password.
            </p>

            <form onSubmit={onSubmitReset}>
              <div className="comm-otp-row" style={{ marginBottom: 18 }}>
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
                <label className="form-label">NEW PASSWORD</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">CONFIRM NEW PASSWORD</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Repeat new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>

              {info && !error && <p className="form-info">{info}</p>}
              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>

              <div className="comm-otp-resend">
                {resendIn > 0 ? (
                  <span>Resend available in {resendIn}s</span>
                ) : (
                  <button type="button" className="comm-linkish" onClick={resendCode} disabled={loading}>
                    Resend code
                  </button>
                )}
                <button
                  type="button"
                  className="comm-linkish"
                  onClick={() => setStep('email')}
                  disabled={loading}
                >
                  Wrong email? Go back
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="login-title">Password updated</h1>
            <p className="login-desc">
              Your password has been reset successfully. You can now log in with your new password.
            </p>
            <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to Login
            </Link>
          </>
        )}

        {step !== 'done' && (
          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-muted)' }}>
            Remembered your password?{' '}
            <Link href="/login" style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
