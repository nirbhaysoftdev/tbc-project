'use client';
// src/app/register/page.tsx - Multi-step signup with email OTP + Google
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';
import { useGoogleSignIn } from '@/lib/useGoogleSignIn';

type AccountType = 'PROFESSIONAL' | 'BUSINESS';
type Step = 'basics' | 'details' | 'otp';

export default function RegisterPage() {
  const router = useRouter();
  const { applyToken } = useAuth();

  const [step, setStep] = useState<Step>('basics');

  // Step 1 - basics
  const [accountType, setAccountType]   = useState<AccountType>('PROFESSIONAL');
  const [name, setName]                 = useState('');
  const [email, setEmail]               = useState('');
  const [countryCode, setCountryCode]   = useState(DEFAULT_COUNTRY.code);
  const [phone, setPhone]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');

  // Step 2 - details
  const [cvFile, setCvFile]             = useState<File | null>(null);
  const [linkedIn, setLinkedIn]         = useState('');
  const [residentId, setResidentId]     = useState('');
  const [residentIdFile, setResidentIdFile] = useState<File | null>(null);
  const [billingAddress, setBillingAddress] = useState('');

  const [tradeLicenseFile, setTradeLicenseFile] = useState<File | null>(null);
  const [vatNumber, setVatNumber]       = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [website, setWebsite]           = useState('');

  // Step 3 - OTP
  const [otpDigits, setOtpDigits]       = useState<string[]>(Array(6).fill(''));
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendIn, setResendIn]         = useState(0);

  const [error, setError]               = useState('');
  const [info, setInfo]                 = useState('');
  const [loading, setLoading]           = useState(false);

  const selectedCountry = useMemo(
    () => COUNTRIES.find((c) => c.code === countryCode) || DEFAULT_COUNTRY,
    [countryCode],
  );

  // ── Google Sign-In ────────────────────────
  const handleGoogleCredential = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.google(credential);
      const { token, user, needsAccountType } = res.data;
      await applyToken(token, user);
      if (user?.status === 'PENDING') {
        router.push('/onboarding/pending');
      } else if (needsAccountType) {
        router.push('/onboarding/profile');
      } else {
        router.push('/community');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };
  const { buttonRef, ready: googleReady, unavailable: googleUnavailable } =
    useGoogleSignIn(handleGoogleCredential);

  // ── Resend countdown ──────────────────────
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  // ── Handlers ──────────────────────────────
  const validateBasics = () => {
    if (name.trim().length < 2) return 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email';
    if (!phone.trim() || phone.replace(/\D/g, '').length < 6) return 'Enter a valid mobile number';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (password !== confirm) return 'Passwords do not match';
    return null;
  };

  const validateDetails = () => {
    if (accountType === 'PROFESSIONAL') {
      if (!cvFile)               return 'Please upload your CV';
      if (!linkedIn.trim())      return 'Enter your LinkedIn profile URL';
      if (!residentId.trim() && !residentIdFile) return 'Provide your Resident ID number or upload the document';
      if (!billingAddress.trim()) return 'Enter your billing address';
    } else {
      if (!tradeLicenseFile)     return 'Please upload your trade license';
      if (!vatNumber.trim())     return 'Enter your VAT number';
      if (!businessAddress.trim()) return 'Enter your business address';
      if (!website.trim())       return 'Enter your business website';
    }
    return null;
  };

  const onSubmitBasics = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const v = validateBasics();
    if (v) return setError(v);
    setStep('details');
  };

  const onSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const v = validateDetails();
    if (v) return setError(v);
    await sendOtp();
  };

  const sendOtp = async () => {
    setLoading(true);
    try {
      const res = await authAPI.sendOtp(email.trim().toLowerCase());
      setOtpExpiresAt(new Date(res.data.expiresAt).getTime());
      setResendIn(60);
      setStep('otp');
      setInfo(`We sent a 6-digit code to ${email}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not send verification code');
    } finally {
      setLoading(false);
    }
  };

  const onOtpChange = (idx: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(0, 1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) {
      const nextInput = document.getElementById(`otp-${idx + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }
  };

  const onOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      const prev = document.getElementById(`otp-${idx - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  };

  const onOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = text.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtpDigits(next);
    const idx = Math.min(text.length, 5);
    (document.getElementById(`otp-${idx}`) as HTMLInputElement | null)?.focus();
  };

  const onSubmitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length !== 6) return setError('Enter the 6-digit code');

    setLoading(true);
    try {
      await authAPI.verifyOtp(email.trim().toLowerCase(), code);
    } catch (err: any) {
      setLoading(false);
      return setError(err.response?.data?.error || 'Invalid code');
    }

    // Verified - now register
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('password', password);
      fd.append('accountType', accountType);
      fd.append('phone', phone.trim());
      fd.append('phoneCountry', selectedCountry.code);
      fd.append('phoneDialCode', selectedCountry.dial);
      fd.append('country', selectedCountry.name);

      if (accountType === 'PROFESSIONAL') {
        if (cvFile) fd.append('cv', cvFile);
        if (linkedIn) fd.append('linkedIn', linkedIn.trim());
        if (residentId) fd.append('residentId', residentId.trim());
        if (residentIdFile) fd.append('residentIdFile', residentIdFile);
        if (billingAddress) fd.append('billingAddress', billingAddress.trim());
      } else {
        if (tradeLicenseFile) fd.append('tradeLicense', tradeLicenseFile);
        if (vatNumber) fd.append('vatNumber', vatNumber.trim());
        if (businessAddress) fd.append('businessAddress', businessAddress.trim());
        if (website) fd.append('website', website.trim());
      }

      const res = await authAPI.register(fd);
      const { token, user } = res.data;
      await applyToken(token, user);
      router.push('/onboarding/profile');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setInfo('');
    setError('');
    await sendOtp();
  };

  // ── UI ────────────────────────────────────
  return (
    <div className="comm-register-page">
      <div className="comm-register-card comm-register-card-wide">
        <div className="comm-register-logo">
          <img src="/images/tbc-logo-1.png" alt="TBC" />
          <div className="comm-register-brand">TRILLION</div>
          <div className="comm-register-sub">Business Community</div>
        </div>

        <StepIndicator step={step} />

        {step === 'basics' && (
          <>
            <h1 className="comm-register-title">Join the Community</h1>
            <p className="comm-register-desc">Create your member account to access the community.</p>

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
              <div className="comm-divider"><span>or sign up with email</span></div>
            </div>

            {/* Account type selector */}
            <div className="comm-type-grid">
              <button
                type="button"
                className={`comm-type-card ${accountType === 'PROFESSIONAL' ? 'is-active' : ''}`}
                onClick={() => setAccountType('PROFESSIONAL')}
              >
                <div className="comm-type-icon">👤</div>
                <div className="comm-type-title">Professional</div>
                <div className="comm-type-sub">Consultants, executives, individuals</div>
              </button>
              <button
                type="button"
                className={`comm-type-card ${accountType === 'BUSINESS' ? 'is-active' : ''}`}
                onClick={() => setAccountType('BUSINESS')}
              >
                <div className="comm-type-icon">🏢</div>
                <div className="comm-type-title">Business</div>
                <div className="comm-type-sub">Companies, entities, operators</div>
              </button>
            </div>

            <form onSubmit={onSubmitBasics}>
              <div className="comm-form-group">
                <label className="comm-form-label">Full Name *</label>
                <input
                  className="comm-form-input"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="comm-form-group">
                <label className="comm-form-label">Email Address *</label>
                <input
                  className="comm-form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="comm-form-group">
                <label className="comm-form-label">Mobile Number *</label>
                <div className="comm-phone-row">
                  <select
                    className="comm-form-select comm-phone-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Country dial code"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.dial} · {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="comm-form-input comm-phone-input"
                    type="tel"
                    inputMode="tel"
                    placeholder="Phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="comm-register-row">
                <div className="comm-form-group">
                  <label className="comm-form-label">Password *</label>
                  <input
                    className="comm-form-input"
                    type="password"
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="comm-form-group">
                  <label className="comm-form-label">Confirm *</label>
                  <input
                    className="comm-form-input"
                    type="password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

              <button
                type="submit"
                className="comm-btn comm-btn-gold"
                style={{ width: '100%', padding: '13px', marginTop: 4 }}
                disabled={loading}
              >
                Continue →
              </button>
            </form>
          </>
        )}

        {step === 'details' && (
          <>
            <h1 className="comm-register-title">
              {accountType === 'PROFESSIONAL' ? 'Professional details' : 'Business details'}
            </h1>
            <p className="comm-register-desc">
              {accountType === 'PROFESSIONAL'
                ? 'Provide your credentials to complete the application.'
                : 'Provide your business documents to complete the application.'}
            </p>

            <form onSubmit={onSubmitDetails}>
              {accountType === 'PROFESSIONAL' ? (
                <>
                  <FileField
                    label="CV / Resume *"
                    hint="PDF, DOC, DOCX (max 10 MB)"
                    accept=".pdf,.doc,.docx"
                    file={cvFile}
                    onChange={setCvFile}
                  />

                  <div className="comm-form-group">
                    <label className="comm-form-label">LinkedIn Profile *</label>
                    <input
                      className="comm-form-input"
                      type="url"
                      placeholder="https://linkedin.com/in/your-handle"
                      value={linkedIn}
                      onChange={(e) => setLinkedIn(e.target.value)}
                      required
                    />
                  </div>

                  <div className="comm-form-group">
                    <label className="comm-form-label">Resident ID Number *</label>
                    <input
                      className="comm-form-input"
                      type="text"
                      placeholder="National / Resident ID number"
                      value={residentId}
                      onChange={(e) => setResidentId(e.target.value)}
                    />
                  </div>

                  <FileField
                    label="Resident ID Document (optional)"
                    hint="Scan / photo - PDF, JPG, PNG (max 10 MB)"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    file={residentIdFile}
                    onChange={setResidentIdFile}
                  />

                  <div className="comm-form-group">
                    <label className="comm-form-label">Billing Address *</label>
                    <textarea
                      className="comm-form-input"
                      rows={3}
                      placeholder="Street, City, Postcode, Country"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <FileField
                    label="Trade License *"
                    hint="PDF, JPG, PNG (max 10 MB)"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    file={tradeLicenseFile}
                    onChange={setTradeLicenseFile}
                  />

                  <div className="comm-form-group">
                    <label className="comm-form-label">VAT Number *</label>
                    <input
                      className="comm-form-input"
                      type="text"
                      placeholder="VAT / Tax registration number"
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      required
                    />
                  </div>

                  <div className="comm-form-group">
                    <label className="comm-form-label">Business Address *</label>
                    <textarea
                      className="comm-form-input"
                      rows={3}
                      placeholder="Registered business address"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div className="comm-form-group">
                    <label className="comm-form-label">Website *</label>
                    <input
                      className="comm-form-input"
                      type="url"
                      placeholder="https://yourcompany.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

              <div className="comm-step-actions">
                <button
                  type="button"
                  className="comm-btn comm-btn-ghost"
                  onClick={() => setStep('basics')}
                  disabled={loading}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="comm-btn comm-btn-gold"
                  disabled={loading}
                >
                  {loading ? 'Sending code…' : 'Send verification code →'}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="comm-register-title">Verify your email</h1>
            <p className="comm-register-desc">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to activate your account.
            </p>

            <form onSubmit={onSubmitOtp}>
              <div className="comm-otp-row" onPaste={onOtpPaste}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
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

              {info && !error && <p className="form-info">{info}</p>}
              {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

              <button
                type="submit"
                className="comm-btn comm-btn-gold"
                style={{ width: '100%', padding: '13px' }}
                disabled={loading}
              >
                {loading ? 'Verifying…' : 'Verify & create account'}
              </button>

              <div className="comm-otp-resend">
                {resendIn > 0 ? (
                  <span>Resend available in {resendIn}s</span>
                ) : (
                  <button type="button" className="comm-linkish" onClick={resendOtp} disabled={loading}>
                    Resend code
                  </button>
                )}
                <button
                  type="button"
                  className="comm-linkish"
                  onClick={() => setStep('details')}
                  disabled={loading}
                >
                  Wrong email? Go back
                </button>
              </div>
            </form>
          </>
        )}

        <div className="comm-register-login">
          Already a member? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'basics',  label: 'Account' },
    { key: 'details', label: 'Details' },
    { key: 'otp',     label: 'Verify' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="comm-steps">
      {steps.map((s, i) => (
        <div key={s.key} className={`comm-step ${i <= idx ? 'is-done' : ''} ${i === idx ? 'is-active' : ''}`}>
          <span className="comm-step-dot">{i + 1}</span>
          <span className="comm-step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function FileField({
  label,
  hint,
  accept,
  file,
  onChange,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="comm-form-group">
      <label className="comm-form-label">{label}</label>
      <div className="comm-file-drop" onClick={() => inputRef.current?.click()}>
        <div className="comm-file-drop-icon">📎</div>
        <div className="comm-file-drop-text">
          {file ? (
            <span className="comm-file-drop-name">{file.name}</span>
          ) : (
            <>
              <div>Click to upload</div>
              <div className="comm-file-drop-hint">{hint}</div>
            </>
          )}
        </div>
        {file && (
          <button
            type="button"
            className="comm-file-remove"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
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
