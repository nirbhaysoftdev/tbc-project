'use client';
// src/components/admin/SignupNotifyTab.tsx
//
// The Super Admin panel's Notifications tab: the addresses that are emailed
// the moment a new member signs up.
//
// This was ADMIN_NOTIFY_EMAIL in the server environment — one address, set at
// deploy time, invisible from the portal, and silently off whenever the
// variable was missing. A portal can take applications for a week with nobody
// watching that way, which is the reason this screen exists.
//
// The same shape as EnquirySettingsTab, on purpose: one list of addresses,
// every one of them receiving every message, tokens you can remove, and a
// super-admin-only save. The differences are that an empty list is allowed
// here (nobody is told, which is a legitimate if unwise choice) and that no
// mail is sent to the addresses added or removed — these are the admins
// looking at this screen, not outsiders who need telling.
import React, { useCallback, useEffect, useState } from 'react';
import { adminAPI, formatDateTime } from '@/lib/api';
// Reuses the project module's form classes (.pj-input, .pj-btn, .pj-error,
// .pj-ok, .pj-token). All `.pj-*` scoped, so the sheet cannot affect the rest
// of the panel.
import '@/styles/projects.css';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';

interface Setting {
  emails: string[];
  source: 'config' | 'default';
  updatedAt: string | null;
  max: number;
  fallback: string;
}

export default function SignupNotifyTab() {
  const { user } = useAuth();
  // An admin may see where the alerts go but not redirect them — an admin who
  // could point them at their own mailbox could approve an applicant with
  // nobody else told. The API enforces this too; this only hides the control.
  const isSuper = isSuperAdminRole(user?.role);

  const [setting, setSetting] = useState<Setting | null>(null);
  // The list being edited, plus the address currently being typed. Separate so
  // an unconfirmed entry cannot be saved by accident.
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    adminAPI.getSignupNotify()
      .then((r) => { setSetting(r.data); setEmails(r.data.emails || []); setDraft(''); })
      .catch(() => setError('Could not load the new-signup recipients.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  /** Commit whatever is in the input box to the list. */
  const addDraft = (): string[] => {
    // A pasted "a@x.com, b@x.com" becomes two entries rather than one.
    const parts = draft.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
    if (parts.length === 0) return emails;

    const next = [...emails];
    const bad: string[] = [];
    for (const part of parts) {
      if (!isEmail(part)) { bad.push(part); continue; }
      if (next.some((e) => e.toLowerCase() === part.toLowerCase())) continue;
      if (next.length >= (setting?.max ?? 10)) break;
      next.push(part);
    }

    if (bad.length > 0) {
      setError(bad.length === 1
        ? `“${bad[0]}” is not a valid email address.`
        : `Not valid email addresses: ${bad.join(', ')}`);
      return emails;
    }

    setError('');
    setEmails(next);
    setDraft('');
    return next;
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
    setNotice('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Anything still in the input box counts as intended — not committing it
    // would silently drop an address just typed.
    const next = addDraft();
    setNotice('');

    if (draft.trim() && !isEmail(draft.trim())) return;   // addDraft set the error
    if (next.length === 0) {
      // The API refuses an empty list, so say what to do instead of letting it
      // 400. Turning the alerts off is a real choice, just not a silent one.
      setError('Add at least one address. To stop the alerts entirely, clear '
             + 'ADMIN_NOTIFY_EMAIL on the server as well as this list.');
      return;
    }

    const before = setting?.source === 'config' ? setting.emails : [];
    const lower  = (l: string[]) => l.map((x) => x.toLowerCase());
    const added   = next.filter((x) => !lower(before).includes(x.toLowerCase()));
    const removed = before.filter((x) => !lower(next).includes(x.toLowerCase()));

    if (added.length === 0 && removed.length === 0) {
      setNotice('Those already receive the new-signup alerts — nothing changed.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminAPI.updateSignupNotify(next);
      const d = res.data;
      setNotice(d.unchanged
        ? 'Those already receive the new-signup alerts — nothing changed.'
        : `New signups will now be emailed to ${d.emails.join(', ')}.`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save the new-signup recipients.');
    } finally {
      setSaving(false);
    }
  };

  const usingDefault = setting?.source === 'default';
  const nobodyWatching = usingDefault && (setting?.emails.length ?? 0) === 0;
  // Dirty if the list differs from what is stored, or something is typed but
  // not yet added — both mean there is a change worth saving.
  const dirty = setting
    ? draft.trim().length > 0
      || emails.length !== setting.emails.length
      || emails.some((e, i) => e.toLowerCase() !== (setting.emails[i] || '').toLowerCase())
    : false;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 18, maxWidth: 680 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
        New signup alerts
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
        Every time someone submits a membership application — by email or with Google —
        these addresses are emailed the applicant’s name, email and membership type, with
        a link straight to the pending list. Every address receives every alert.
      </p>

      {error  && <div className="pj-error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="pj-ok"    style={{ marginBottom: 12 }}>{notice}</div>}

      {/* The state worth shouting about: applications are arriving and no
          mailbox is being told. */}
      {nobodyWatching && !error && (
        <div className="pj-error" style={{ marginBottom: 12 }}>
          Nobody is being notified of new applications. Add an address below.
        </div>
      )}

      {!setting ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <form onSubmit={save}>
          {emails.length > 0 && (
            <div className="pj-picker-selected" style={{ marginTop: 0, marginBottom: 10 }}>
              {emails.map((email) => (
                <span className="pj-token" key={email}>
                  <span>{email}</span>
                  <button type="button" aria-label={`Remove ${email}`}
                    disabled={saving || !isSuper}
                    onClick={() => removeEmail(email)}>×</button>
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <input
                className="pj-input"
                type="email"
                value={draft}
                disabled={saving || !isSuper || emails.length >= setting.max}
                onChange={(e) => { setDraft(e.target.value); setError(''); setNotice(''); }}
                // Enter adds to the list rather than submitting, so typing a
                // second address cannot accidentally save the first.
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDraft(); }
                }}
                onBlur={() => { if (draft.trim()) addDraft(); }}
                placeholder={emails.length >= setting.max
                  ? `Maximum of ${setting.max} addresses`
                  : 'admin@example.com — Enter to add another'}
                aria-label="Add a new-signup alert recipient email address"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.6 }}>
                {usingDefault ? (
                  setting.fallback ? (
                    <>
                      No addresses have been set here, so the server’s
                      ADMIN_NOTIFY_EMAIL (<strong>{setting.fallback}</strong>) is in use.
                      Saving a list here replaces it.
                    </>
                  ) : (
                    <>Nothing is configured, and ADMIN_NOTIFY_EMAIL is not set on the server.</>
                  )
                ) : (
                  <>
                    {setting.emails.length} address{setting.emails.length === 1 ? '' : 'es'} configured
                    {setting.updatedAt ? `, last changed ${formatDateTime(setting.updatedAt)}` : ''}.
                    The change is recorded in Logs.
                  </>
                )}
              </div>
            </div>
            {isSuper ? (
              <button type="submit" className="pj-btn pj-btn-primary" disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Changing these addresses requires super admin access.
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
