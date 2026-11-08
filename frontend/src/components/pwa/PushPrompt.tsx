'use client';
// src/components/pwa/PushPrompt.tsx
//
// The "turn on notifications" banner. Shown to a signed-in member whose
// browser can do push, has not yet decided, and has not snoozed it. It asks on
// a tap - a permission dialog fired on page load is dismissed reflexively and,
// once blocked, cannot be asked again.
import { useEffect, useState } from 'react';
import { enablePush, isSubscribed, pushPermission, pushSupport, syncPush } from '@/lib/push';
import '@/styles/pwa.css';

const SNOOZE_KEY = 'tbc_push_snooze_until';
const SNOOZE_DAYS = 7;

const snoozed = () => {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
};

export default function PushPrompt() {
  const [visible, setVisible] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    syncPush();
    const support = pushSupport();
    if (support === 'unsupported' || snoozed()) return undefined;
    if (support === 'needs-install') { setNeedsInstall(true); return undefined; }
    if (pushPermission() !== 'default') return undefined;
    let alive = true;
    const timer = window.setTimeout(async () => {
      if (alive && !(await isSubscribed())) setVisible(true);
    }, 4000);
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* private mode */ }
    setVisible(false);
  };

  const turnOn = async () => {
    setBusy(true); setError('');
    try { await enablePush(); setVisible(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not enable notifications'); }
    finally { setBusy(false); }
  };

  // On iOS the banner for installing already explains Add to Home Screen; push
  // simply is not available until then, so there is nothing to ask yet.
  if (!visible || needsInstall) return null;

  return (
    <div role="dialog" aria-live="polite" className="pwa-banner" style={{ gridTemplateColumns: '1fr' }}>
      <div className="pwa-banner-body">
        <div className="pwa-banner-title">Stay in the loop</div>
        <div className="pwa-banner-sub">Get an alert for new deals, launches, approvals and anything that needs you.</div>
        {error && <div className="pwa-banner-note" role="alert">{error}</div>}
      </div>
      <div className="pwa-banner-actions">
        <button className="pwa-btn-install" onClick={turnOn} disabled={busy}>{busy ? 'Enabling…' : 'Turn on'}</button>
        <button className="pwa-btn-later" onClick={later}>Not now</button>
      </div>
    </div>
  );
}
