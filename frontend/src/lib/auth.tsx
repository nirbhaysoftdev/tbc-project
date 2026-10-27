'use client';
// src/lib/auth.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { readToken, writeToken, clearToken } from './tokenStore';
import { authAPI, profileAPI } from './api';
import { useI18n } from '@/i18n/I18nProvider';
import type { LanguageCode } from '@/i18n/languages';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'MEMBER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'PENDING' | 'FROZEN' | 'REJECTED';
  kycStatus: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  walletEnabled: boolean;
  profilePhoto: string | null;
  /** Saved UI language, e.g. "it". Null until the member picks one. */
  locale?: string | null;
  wallet?: {
    investmentAmount: number;
    profitAmount:     number;
    totalBalance:     number;
    currency:         string;
    frozen:           boolean;
  };
}

interface AuthCtx {
  user:    User | null;
  loading: boolean;
  /**
   * A credential exists in storage. Distinct from `user`, which only becomes
   * set once /auth/me has answered.
   *
   * A guard must not treat "no user yet" as "signed out": if /auth/me fails
   * because the API is slow or briefly unreachable, the session is still
   * perfectly good and bouncing to /login logs the member out of the UI while
   * leaving them logged in everywhere else. Redirect on `!hasToken`, not on
   * `!user`.
   */
  hasToken: boolean;
  /** The last /auth/me failed for a reason other than a rejected token. */
  authError: boolean;
  login:   (email: string, password: string) => Promise<User>;
  applyToken: (token: string, user?: User) => Promise<void>;
  logout:  () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

/**
 * The stored credential, from wherever it was written.
 *
 * Distinct from `user`, which only becomes set once /auth/me has answered.
 * Every store access goes through lib/tokenStore, which treats a browser with
 * cookies and storage blocked as a session that lives in memory rather than
 * as a sign-in that failed.
 */
function storedToken(): string | null {
  return readToken();
}

function clearStoredToken() {
  try {
    clearToken();
  } catch { /* nothing to clear */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasToken,  setHasToken]  = useState(false);
  const [authError, setAuthError] = useState(false);
  const { setProfileLanguage, registerRemotePersist } = useI18n();

  // ── Language preference, both directions ──────────────────────────────────
  //
  // Down: when a signed-in user's saved `locale` arrives, hand it to the i18n
  // provider. It applies it only if the member has not already picked a
  // language in this session, so a slow /auth/me cannot snap the UI back
  // (precedence lives in src/i18n/preference.ts, not here).
  useEffect(() => {
    if (user?.locale) setProfileLanguage(user.locale);
  }, [user?.locale, setProfileLanguage]);

  // Up: while someone is signed in, an explicit selector choice is written to
  // their profile so it follows them to another device. Registered as a
  // callback rather than called directly because the selector lives above
  // AuthProvider in the tree and must keep working when nobody is signed in.
  useEffect(() => {
    if (!user) {
      registerRemotePersist(null);
      return;
    }
    registerRemotePersist((lang: LanguageCode) => {
      // Fire-and-forget on purpose: the choice is already applied and stored
      // locally, so a failed write must not surface an error or revert the UI.
      profileAPI.setLanguage(lang).catch(() => {});
      setUser((prev) => (prev ? { ...prev, locale: lang } : prev));
    });
    return () => registerRemotePersist(null);
  }, [user, registerRemotePersist]);

  const refresh = async () => {
    try {
      const res = await authAPI.me();
      setUser(res.data);
      setHasToken(true);
      setAuthError(false);
    } catch (err: any) {
      const status = err?.response?.status;

      // A rejected credential is the only thing that means "signed out". The
      // token is discarded here so the guards see `hasToken: false` and send
      // the member to /login once, properly, instead of leaving a dead token
      // in storage that keeps the rest of the app looking signed in.
      if (status === 401 || status === 403) {
        clearStoredToken();
        setHasToken(false);
        setUser(null);
        setAuthError(false);
        return;
      }

      // Anything else — the API is down, a timeout, a 500 — is a failure to
      // ASK, not an answer. The session is untouched, so the credential stays
      // and the guards hold their ground rather than redirecting.
      setUser(null);
      setHasToken(Boolean(storedToken()));
      setAuthError(true);
    }
  };

  useEffect(() => {
    const token = storedToken();
    setHasToken(Boolean(token));
    if (token) {
      refresh().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    const { token, user: u } = res.data;
    // Never throws: a browser with storage blocked keeps the token in memory
    // for this tab rather than turning a successful sign-in into an error.
    writeToken(token);
    setUser(u);
    setHasToken(true);
    setAuthError(false);
    return u as User;
  };

  const applyToken = async (token: string, u?: User) => {
    writeToken(token);
    setHasToken(true);
    setAuthError(false);
    if (u) setUser(u);
    else await refresh();
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    setHasToken(false);
    setAuthError(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, hasToken, authError, login, applyToken, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
