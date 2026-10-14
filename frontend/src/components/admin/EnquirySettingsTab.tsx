'use client';
// src/components/admin/EnquirySettingsTab.tsx
//
// The Admin Panel's Enquiries tab: the one address that every Connect Now /
// Enquire Now message in the portal is delivered to, plus the record of what
// has been sent.
//
// Deliberately one setting rather than one per project and company. The
// per-item version meant the address had to be re-entered on every record an
// admin created, and nobody could answer "where do enquiries go?" without
// opening all of them.
//
// Changing it notifies both mailboxes — the outgoing one that it will stop
// receiving enquiries, the incoming one that it has started. That is handled
// server-side (backend services/mailer.js); this screen reports what happened.
import React, { useCallback, useEffect, useState } from 'react';
import { enquiriesAPI, formatDateTime } from '@/lib/api';
// This screen reuses the project module's form and feedback classes
// (.pj-input, .pj-select, .pj-btn, .pj-error, .pj-ok). They are all `.pj-*`
// scoped, so importing the sheet here cannot affect the rest of the panel.
import '@/styles/projects.css';

interface Recipient {
  emails: string[];
  source: 'config' | 'default';
  updatedAt: string | null;
  max: number;
  fallback: string;
}

interface EnquiryRow {
  id: string;
  subjectName: string;
  message: string;
  recipientEmail: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  member: { id: string; name: string; email: string } | null;
  project: { id: string; title: string } | null;
  company: { id: string; name: string } | null;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  SENT:    { background: 'rgba(46,204,113,0.14)', color: '#5ad68c' },
  PENDING: { background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' },
  FAILED:  { background: 'rgba(224,82,82,0.14)',  color: '#ef8686' },
};

export default function EnquirySettingsTab() {
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  // The list being edited, plus the address currently being typed. Kept
  // separate so an unconfirmed entry cannot be saved by accident.
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingRows, setLoadingRows] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadRecipient = useCallback(() => {
    enquiriesAPI.getRecipient()
      .then((r) => { setRecipient(r.data); setEmails(r.data.emails || []); setDraft(''); })
      .catch(() => setError('Could not load the enquiry recipients.'));
  }, []);

  const loadRows = useCallback(() => {
    setLoadingRows(true);
    const params: Record<string, string> = { limit: '25' };
    if (statusFilter) params.status = statusFilter;
    enquiriesAPI.list(params)
      .then((r) => { setRows(r.data.enquiries || []); setTotal(r.data.pagination?.total ?? 0); })
      .catch(() => setRows([]))
      .finally(() => setLoadingRows(false));
  }, [statusFilter]);

  useEffect(() => { loadRecipient(); }, [loadRecipient]);
  useEffect(() => { loadRows(); }, [loadRows]);

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
      if (next.length >= (recipient?.max ?? 10)) break;
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

    // Anything still sitting in the input box counts as intended — not
    // committing it would silently drop an address the admin just typed.
    const next = addDraft();
    setNotice('');

    if (next.length === 0) {
      setError('Add at least one email address.');
      return;
    }
    if (draft.trim() && !isEmail(draft.trim())) return;   // addDraft set the error

    const before = recipient?.source === 'config' ? recipient.emails : [];
    const lower = (l: string[]) => l.map((x) => x.toLowerCase());
    const added = next.filter((x) => !lower(before).includes(x.toLowerCase()));
    const removed = before.filter((x) => !lower(next).includes(x.toLowerCase()));

    if (added.length === 0 && removed.length === 0) {
      setNotice('Those are already the enquiry recipients — nothing changed.');
      return;
    }

    // The change is announced to the mailboxes involved, so it is worth a
    // confirmation rather than happening on a stray Enter.
    const lines = [`Send all project and company enquiries to ${next.join(', ')}?`, ''];
    if (added.length)   lines.push(`${added.join(', ')} will be told ${added.length === 1 ? 'it' : 'they'} now receive enquiries.`);
    if (removed.length) lines.push(`${removed.join(', ')} will be told ${removed.length === 1 ? 'it' : 'they'} no longer do.`);
    if (!window.confirm(lines.join('\n'))) return;

    setSaving(true);
    try {
      const res = await enquiriesAPI.updateRecipient(next);
      const d = res.data;

      if (d.unchanged) {
        setNotice('Those are already the enquiry recipients — nothing changed.');
      } else {
        // Reported honestly: the setting is saved either way, but a
        // notification that could not be delivered is worth knowing about,
        // since it usually means the address is wrong.
        const parts = [`Enquiries now go to ${d.emails.join(', ')}.`];
        if (d.added?.length) {
          const ok = d.notified?.notifiedAdded?.length || 0;
          parts.push(ok === d.added.length
            ? `${ok === 1 ? 'The new address has' : 'The new addresses have'} been notified.`
            : `Could NOT notify ${d.added.filter((a: string) => !d.notified?.notifiedAdded?.includes(a)).join(', ')} — check the address is correct.`);
        }
        if (d.removed?.length) {
          const ok = d.notified?.notifiedRemoved?.length || 0;
          parts.push(ok === d.removed.length
            ? `${d.removed.join(', ')} ${d.removed.length === 1 ? 'has' : 'have'} been told ${d.removed.length === 1 ? 'it no longer receives' : 'they no longer receive'} enquiries.`
            : `Could not notify ${d.removed.join(', ')} of the change.`);
        }
        setNotice(parts.join(' '));
      }
      loadRecipient();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save the enquiry recipients.');
    } finally {
      setSaving(false);
    }
  };

  const usingDefault = recipient?.source === 'default';
  // Dirty if the list differs from what is stored, or something is typed but
  // not yet added — both mean there is a change worth saving.
  const dirty = recipient
    ? draft.trim().length > 0
      || emails.length !== recipient.emails.length
      || emails.some((e, i) => e.toLowerCase() !== (recipient.emails[i] || '').toLowerCase())
    : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── The setting ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: 18, maxWidth: 680 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
          Enquiry recipient
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
          Every “Connect Now” and “Enquire Now” message a member sends — about any project
          or any company — is delivered to these addresses. Set them once; they apply
          portal-wide, and every address receives every enquiry.
        </p>

        {error && <div className="pj-error" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <div className="pj-ok" style={{ marginBottom: 12 }}>{notice}</div>}

        {!recipient ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <form onSubmit={save}>
            {/* The list. Each address is removable; the input below adds more. */}
            {emails.length > 0 && (
              <div className="pj-picker-selected" style={{ marginTop: 0, marginBottom: 10 }}>
                {emails.map((email) => (
                  <span className="pj-token" key={email}>
                    <span>{email}</span>
                    <button type="button" aria-label={`Remove ${email}`}
                      disabled={saving}
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
                  disabled={saving || emails.length >= recipient.max}
                  onChange={(e) => { setDraft(e.target.value); setError(''); setNotice(''); }}
                  // Enter adds to the list rather than submitting the form, so
                  // typing a second address cannot accidentally save the first.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDraft(); }
                  }}
                  onBlur={() => { if (draft.trim()) addDraft(); }}
                  placeholder={emails.length >= recipient.max
                    ? `Maximum of ${recipient.max} addresses`
                    : 'enquiries@example.com — Enter to add another'}
                  aria-label="Add an enquiry recipient email address"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.6 }}>
                  {usingDefault ? (
                    <>
                      No addresses have been set yet, so the portal default
                      (<strong>{recipient.fallback}</strong>) is in use.
                    </>
                  ) : (
                    <>
                      {recipient.emails.length} address{recipient.emails.length === 1 ? '' : 'es'} configured
                      {recipient.updatedAt ? `, last changed ${formatDateTime(recipient.updatedAt)}` : ''}.
                      Addresses added or removed are emailed about the change.
                    </>
                  )}
                </div>
              </div>
              <button type="submit" className="pj-btn pj-btn-primary" disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save & notify'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── The record ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {loadingRows ? 'Loading enquiries…' : `${total} enquir${total === 1 ? 'y' : 'ies'}`}
          </div>
          <select className="pj-select" style={{ width: 'auto' }} value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by delivery status">
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>

        {rows.length === 0 && !loadingRows ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)',
                        background: 'var(--bg-card)', border: '1px dashed var(--border)',
                        borderRadius: 14 }}>
            No enquiries yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((row) => {
              const open = expanded === row.id;
              return (
                <div key={row.id}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                           borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                                flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {row.subjectName}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
                                       marginInlineStart: 8 }}>
                          {row.company ? 'COMPANY' : 'PROJECT'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {row.member ? `${row.member.name} · ${row.member.email}` : 'Member removed'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'end' }}>
                      <span style={{ ...STATUS_STYLE[row.status], padding: '3px 8px',
                                     borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                                     letterSpacing: '0.08em' }}>
                        {row.status}
                      </span>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5 }}>
                        {formatDateTime(row.createdAt)}
                      </div>
                    </div>
                  </div>

                  <button type="button"
                    onClick={() => setExpanded(open ? null : row.id)}
                    style={{ border: 'none', background: 'none', padding: 0, marginTop: 8,
                             fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer' }}>
                    {open ? 'Hide message' : 'Show message'}
                  </button>

                  {open && (
                    <div style={{ marginTop: 10, paddingTop: 10,
                                  borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)',
                                    lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {row.message}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 10 }}>
                        Delivered to {row.recipientEmail}
                        {row.sentAt ? ` · ${formatDateTime(row.sentAt)}` : ''}
                      </div>
                      {row.error && (
                        <div style={{ fontSize: 11, color: '#ef8686', marginTop: 6 }}>
                          {row.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
