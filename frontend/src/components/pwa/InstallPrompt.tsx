'use client';
// src/components/pwa/InstallPrompt.tsx
//
// The "install the app" invitation, shown inside the portal once a member is
// signed in. One component, four scripts, because installing a web app is a
// different act on every platform - see src/lib/pwa.ts for the matrix.
//
//   Android / desktop Chrome & Edge   a real Install button; the browser's own
//                                     dialog does the work.
//   iPhone / iPad (Safari)            the Share → Add to Home Screen steps,
//                                     drawn out, because there is no API that
//                                     can do it for them. Every iOS version.
//   iPhone / iPad (not Safari)        the same, preceded by "open this in
//                                     Safari", which is the actual blocker.
//   Safari on macOS                   File → Add to Dock.
//
// WHY IT IS BEHIND THE LOGIN AND NOT ON THE LANDING PAGE. The thing worth
// installing is the portal - a member's wallet, Deal Room and community - and
// a visitor who has not joined yet has nothing to open. Asking at the first
// screen is also how an install prompt gets dismissed reflexively.
//
// IT ASKS ONCE AND THEN LEAVES. "Not now" is remembered for SNOOZE_DAYS, an
// install is remembered forever, and when it is already running as an app it
// never renders at all. The delay before it appears is so it arrives after the
// page the member came for, not on top of it.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InstallMode, installMode, isStandalone, isSnoozed, snooze, subscribe,
  showInstallPrompt, wasInstalled, isInAppBrowser,
} from '@/lib/pwa';
import '@/styles/pwa.css';

/** Long enough for the page behind it to have settled. */
const APPEAR_AFTER_MS = 2500;

export default function InstallPrompt() {
  const { t } = useTranslation(['common']);
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Re-read the platform whenever pwa.ts has news: `beforeinstallprompt` may
  // arrive after this component has already decided it was an iOS-style case.
  const evaluate = useCallback(() => {
    if (isStandalone() || wasInstalled() || isInAppBrowser()) { setMode(null); return; }
    const next = installMode();
    setMode(next === 'unsupported' ? null : next);
  }, []);

  useEffect(() => {
    evaluate();
    return subscribe(evaluate);
  }, [evaluate]);

  useEffect(() => {
    if (!mode || isSnoozed()) return undefined;
    const timer = window.setTimeout(() => setOpen(true), APPEAR_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const close = useCallback((remember: boolean) => {
    if (remember) snooze();
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, 180);
  }, []);

  const install = useCallback(async () => {
    const outcome = await showInstallPrompt();
    // Dismissing the browser's own dialog is an answer too: snoozing it here
    // is what stops the banner reappearing on the next page.
    if (outcome !== 'accepted') snooze();
    close(false);
  }, [close]);

  if (!mode || !open) return null;

  const canPrompt = mode === 'prompt';

  return (
    <aside
      className={`pwa-banner${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-live="polite"
      aria-label={t('common:install.title')}
    >
      <img className="pwa-banner-icon" src="/icons/icon-192.png" alt="" width={48} height={48} />

      <div className="pwa-banner-body">
        <h2 className="pwa-banner-title">{t('common:install.title')}</h2>
        <p className="pwa-banner-sub">{t('common:install.sub')}</p>

        {mode === 'ios-safari' && <IosSteps t={t} />}
        {mode === 'ios-other' && (
          <>
            <p className="pwa-banner-note">{t('common:install.iosOther')}</p>
            <IosSteps t={t} />
          </>
        )}
        {mode === 'mac-safari' && (
          <ol className="pwa-steps">
            <li>{t('common:install.macStep1')}</li>
            <li>{t('common:install.macStep2')}</li>
          </ol>
        )}
      </div>

      <div className="pwa-banner-actions">
        {canPrompt && (
          <button type="button" className="pwa-btn-install" onClick={install}>
            {t('common:install.install')}
          </button>
        )}
        <button type="button" className="pwa-btn-later" onClick={() => close(true)}>
          {canPrompt ? t('common:install.notNow') : t('common:install.gotIt')}
        </button>
      </div>

      <button
        type="button"
        className="pwa-banner-close"
        onClick={() => close(true)}
        aria-label={t('common:action.close')}
      >
        ×
      </button>
    </aside>
  );
}

/** The three taps, in order. The share glyph is drawn rather than named,
 *  because "the square with the arrow" is how it is actually recognised. */
function IosSteps({ t }: { t: (key: string) => string }) {
  return (
    <ol className="pwa-steps">
      <li>
        {t('common:install.iosStep1')} <ShareGlyph />
      </li>
      <li>{t('common:install.iosStep2')}</li>
      <li>{t('common:install.iosStep3')}</li>
    </ol>
  );
}

function ShareGlyph() {
  return (
    <svg className="pwa-glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 3v12M12 3l-3.2 3.2M12 3l3.2 3.2"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M6 11H4.8v9.2h14.4V11H18"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
