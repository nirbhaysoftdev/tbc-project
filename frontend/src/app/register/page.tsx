'use client';
// src/app/register/page.tsx - Multi-step signup
// Uses the same field structure, validation rules, and document requirements
// as the admin "Add Member" flow (see app/admin/page.tsx's Add Member wizard).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trans, useTranslation } from 'react-i18next';
import { authAPI } from '@/lib/api';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';
import { useGoogleSignIn } from '@/lib/useGoogleSignIn';
import { useAuth } from '@/lib/auth';
import LanguageSelector from '@/components/i18n/LanguageSelector';

type MemberType = 'COMPANY' | 'PERSONAL';
type Step = 'basics' | 'details' | 'otp' | 'done';

export default function RegisterPage() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const { applyToken } = useAuth();

  const [step, setStep] = useState<Step>('basics');

  // Step 1 - member type & contact
  const [memberType, setMemberType]     = useState<MemberType>('PERSONAL');
  const [email, setEmail]               = useState('');
  const [countryCode, setCountryCode]   = useState(DEFAULT_COUNTRY.code);
  const [mobile, setMobile]             = useState('');
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');

  // Step 2 - type-specific details & documents
  const [companyName, setCompanyName]   = useState('');
  const [fullName, setFullName]         = useState('');
  const [city, setCity]                 = useState('');
  const [country, setCountry]           = useState('');
  const [tradeLicenseFile, setTradeLicenseFile] = useState<File | null>(null);
  const [residentIdFile, setResidentIdFile]     = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile]       = useState<File | null>(null);

  // Step 3 - OTP
  const [otpDigits, setOtpDigits]       = useState<string[]>(Array(6).fill(''));
  const [resendIn, setResendIn]         = useState(0);
  // The email whose code has already been consumed. A code is single-use, so a
  // retry after a failed registration must not try to verify it a second time.
  const [verifiedEmail, setVerifiedEmail] = useState('');

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
      if (needsAccountType) router.push('/onboarding/profile');
      else router.push('/community');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:google.failed'));
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

  // ── Validation (mirrors admin Add Member rules) ──
  // Validation messages are translated at the point of display, not stored
  // translated, so switching language mid-form re-renders the current error in
  // the new language on the next validation pass.
  const validateBasics = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return t('auth:register.errors.email');
    if (!mobile.trim() || mobile.replace(/\D/g, '').length < 6) return t('auth:register.errors.mobile');
    if (password.length < 8) return t('auth:register.errors.passwordLength');
    if (password !== confirm) return t('auth:register.errors.passwordMismatch');
    return null;
  };

  const validateDetails = () => {
    if (!city.trim())    return t('auth:register.errors.city');
    if (!country.trim()) return t('auth:register.errors.country');
    if (memberType === 'COMPANY') {
      if (!companyName.trim()) return t('auth:register.errors.companyName');
      if (!tradeLicenseFile)   return t('auth:register.errors.tradeLicense');
    } else {
      if (!fullName.trim())  return t('auth:register.errors.fullName');
      if (!residentIdFile)   return t('auth:register.errors.residentId');
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
      await authAPI.sendOtp(email.trim().toLowerCase());
      setVerifiedEmail('');
      setResendIn(60);
      setStep('otp');
      setInfo(t('auth:register.codeSent', { email }));
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:register.couldNotSendCode'));
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
    if (loading) return;
    setError('');
    const normEmail = email.trim().toLowerCase();
    const code = otpDigits.join('');
    if (code.length !== 6) return setError(t('auth:register.errors.code'));

    setLoading(true);
    if (verifiedEmail !== normEmail) {
      try {
        await authAPI.verifyOtp(normEmail, code);
        setVerifiedEmail(normEmail);
      } catch (err: any) {
        setLoading(false);
        return setError(err.response?.data?.error || t('auth:register.invalidCode'));
      }
    }

    // Verified - now register. Pending members are not logged in automatically;
    // they can only sign in once an admin approves the application.
    try {
      const fd = new FormData();
      fd.append('memberType', memberType);
      fd.append('email', normEmail);
      fd.append('password', password);
      fd.append('mobile', mobile.trim());
      fd.append('mobileCountry', selectedCountry.code);
      fd.append('mobileDialCode', selectedCountry.dial);
      fd.append('city', city.trim());
      fd.append('country', country.trim());

      if (memberType === 'COMPANY') fd.append('companyName', companyName.trim());
      else                          fd.append('fullName', fullName.trim());

      if (tradeLicenseFile) fd.append('tradeLicense', tradeLicenseFile);
      if (residentIdFile)   fd.append('residentId', residentIdFile);
      if (passportFile)     fd.append('passport', passportFile);
      if (photoFile)        fd.append('photo', photoFile);

      await authAPI.register(fd);
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth:register.failed'));
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
        {/* Registration is a public entry point, so it carries its own
            selector (§4). */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageSelector variant="panel" />
        </div>

        <div className="comm-register-logo">
          <img src="/images/tbc-logo-1.png" alt={t('common:brand.full')} />
          <div className="comm-register-brand">{t('common:brand.name')}</div>
          <div className="comm-register-sub">{t('common:brand.subTitle')}</div>
        </div>

        {step !== 'done' && <StepIndicator step={step} />}

        {step === 'basics' && (
          <>
            <h1 className="comm-register-title">{t('auth:register.title')}</h1>
            <p className="comm-register-desc">{t('auth:register.subtitle')}</p>

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
              <div className="comm-divider"><span>{t('auth:google.dividerSignUp')}</span></div>
            </div>

            {/* Member type selector */}
            <div className="comm-type-grid">
              <button
                type="button"
                className={`comm-type-card ${memberType === 'COMPANY' ? 'is-active' : ''}`}
                onClick={() => setMemberType('COMPANY')}
              >
                <div className="comm-type-title">{t('auth:register.memberType.company')}</div>
                <div className="comm-type-sub">{t('auth:register.memberType.companyHint')}</div>
              </button>
              <button
                type="button"
                className={`comm-type-card ${memberType === 'PERSONAL' ? 'is-active' : ''}`}
                onClick={() => setMemberType('PERSONAL')}
              >
                <div className="comm-type-title">{t('auth:register.memberType.personal')}</div>
                <div className="comm-type-sub">{t('auth:register.memberType.personalHint')}</div>
              </button>
            </div>

            <form onSubmit={onSubmitBasics}>
              <div className="comm-form-group">
                <label className="comm-form-label">{t('auth:register.emailLabel')}</label>
                <input
                  className="comm-form-input"
                  type="email"
                  dir="ltr"
                  placeholder={t('auth:register.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="comm-form-group">
                <label className="comm-form-label">{t('auth:register.mobileLabel')}</label>
                <div className="comm-phone-row">
                  <select
                    className="comm-form-select comm-phone-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label={t('auth:register.dialCodeLabel')}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.dial} · {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="comm-form-input comm-phone-input ltr-embed"
                    type="tel"
                    inputMode="tel"
                    // Phone numbers stay left-to-right inside an RTL page (§10).
                    dir="ltr"
                    placeholder={t('auth:register.mobilePlaceholder')}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="comm-register-row">
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.passwordLabel')}</label>
                  <input
                    className="comm-form-input"
                    type="password"
                    dir="ltr"
                    placeholder={t('auth:register.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.confirmLabel')}</label>
                  <input
                    className="comm-form-input"
                    type="password"
                    dir="ltr"
                    placeholder={t('auth:register.confirmPlaceholder')}
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
                {t('auth:register.continue')}
              </button>
            </form>
          </>
        )}

        {step === 'details' && (
          <>
            <h1 className="comm-register-title">
              {memberType === 'COMPANY'
                ? t('auth:register.detailsTitleCompany')
                : t('auth:register.detailsTitlePersonal')}
            </h1>
            <p className="comm-register-desc">
              {memberType === 'COMPANY'
                ? t('auth:register.detailsDescCompany')
                : t('auth:register.detailsDescPersonal')}
            </p>

            <form onSubmit={onSubmitDetails}>
              {memberType === 'COMPANY' ? (
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.companyNameLabel')}</label>
                  <input
                    className="comm-form-input"
                    type="text"
                    placeholder={t('auth:register.companyNamePlaceholder')}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.fullNameLabel')}</label>
                  <input
                    className="comm-form-input"
                    type="text"
                    placeholder={t('auth:register.fullNamePlaceholder')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="comm-register-row">
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.cityLabel')}</label>
                  <input
                    className="comm-form-input"
                    type="text"
                    placeholder={t('auth:register.cityPlaceholder')}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
                <div className="comm-form-group">
                  <label className="comm-form-label">{t('auth:register.countryLabel')}</label>
                  <select
                    className="comm-form-select"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                  >
                    <option value="">{t('auth:register.countryPlaceholder')}</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '18px 0 8px' }}>
                {t('auth:register.requiredDocument')}
              </p>
              {memberType === 'COMPANY' ? (
                <FileField
                  label={t('auth:register.docs.tradeLicense')}
                  hint={t('auth:register.docs.hintPdf')}
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  file={tradeLicenseFile}
                  onChange={setTradeLicenseFile}
                />
              ) : (
                <FileField
                  label={t('auth:register.docs.residentId')}
                  hint={t('auth:register.docs.hintPdf')}
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  file={residentIdFile}
                  onChange={setResidentIdFile}
                />
              )}

              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '18px 0 8px' }}>
                {t('auth:register.optionalDocuments')}
              </p>
              <FileField
                label={t('auth:register.docs.passport')}
                hint={t('auth:register.docs.hintPdf')}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                file={passportFile}
                onChange={setPassportFile}
              />
              {memberType === 'COMPANY' && (
                <FileField
                  label={t('auth:register.docs.residentIdOptional')}
                  hint={t('auth:register.docs.hintPdf')}
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  file={residentIdFile}
                  onChange={setResidentIdFile}
                />
              )}
              <FileField
                label={t('auth:register.docs.photo')}
                hint={t('auth:register.docs.hintImage')}
                accept=".jpg,.jpeg,.png,.webp"
                file={photoFile}
                onChange={setPhotoFile}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -6, marginBottom: 14 }}>
                {t('auth:register.optionalNote')}
              </p>

              {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

              <div className="comm-step-actions">
                <button
                  type="button"
                  className="comm-btn comm-btn-ghost"
                  onClick={() => setStep('basics')}
                  disabled={loading}
                >
                  {t('auth:register.back')}
                </button>
                <button
                  type="submit"
                  className="comm-btn comm-btn-gold"
                  disabled={loading}
                >
                  {loading ? t('auth:register.sendingCode') : t('auth:register.sendCode')}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="comm-register-title">{t('auth:register.verifyTitle')}</h1>
            {/* <Trans> rather than string concatenation: where the email sits in
                the sentence differs by language, and in Arabic and Persian it
                also has to render LTR inside RTL prose. */}
            <p className="comm-register-desc">
              <Trans
                i18nKey="auth:register.verifyDesc"
                values={{ email }}
                components={[<span key="0" className="ltr-embed" />, <strong key="1" className="ltr-embed" />]}
              />
            </p>

            <form onSubmit={onSubmitOtp}>
              {/* The OTP row is a fixed sequence of digits and keeps its visual
                  order in every language, so it is pinned LTR (§10). */}
              <div className="comm-otp-row ltr-embed" dir="ltr" onPaste={onOtpPaste}>
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
                {loading ? t('auth:register.verifySubmitting') : t('auth:register.verifySubmit')}
              </button>

              <div className="comm-otp-resend">
                {resendIn > 0 ? (
                  <span>{t('auth:register.resendIn', { seconds: resendIn })}</span>
                ) : (
                  <button type="button" className="comm-linkish" onClick={resendOtp} disabled={loading}>
                    {t('auth:register.resend')}
                  </button>
                )}
                <button
                  type="button"
                  className="comm-linkish"
                  onClick={() => setStep('details')}
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
            <h1 className="comm-register-title">{t('auth:register.doneTitle')}</h1>
            <p className="comm-register-desc">
              <Trans
                i18nKey="auth:register.doneDesc"
                values={{ email }}
                components={[
                  <span key="0" />,
                  <strong key="1" />,
                  <span key="2" />,
                  <strong key="3" className="ltr-embed" />,
                ]}
              />
            </p>
            <Link href="/login" className="comm-btn comm-btn-gold" style={{ width: '100%', padding: '13px', display: 'block', textAlign: 'center', marginTop: 8 }}>
              {t('auth:register.goToLogin')}
            </Link>
          </>
        )}

        {step !== 'done' && (
          <div className="comm-register-login">
            {t('auth:register.alreadyMember')} <Link href="/login">{t('auth:register.signIn')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const { t } = useTranslation('auth');
  const steps: { key: Step; label: string }[] = [
    { key: 'basics',  label: t('register.steps.basics') },
    { key: 'details', label: t('register.steps.details') },
    { key: 'otp',     label: t('register.steps.verify') },
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
  const { t } = useTranslation('auth');
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="comm-form-group">
      <label className="comm-form-label">{label}</label>
      <div className="comm-file-drop" onClick={() => inputRef.current?.click()}>
        <div className="comm-file-drop-text">
          {file ? (
            <span className="comm-file-drop-name">{file.name}</span>
          ) : (
            <>
              <div>{t('register.docs.clickToUpload')}</div>
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
            {t('register.docs.remove')}
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
