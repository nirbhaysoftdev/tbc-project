'use client';
// src/components/enquiry/EnquiryModal.tsx
//
// Connect Now / Enquire Now.
//
// One modal for both modules: a project passes `projectId`, a company passes
// `companyId`, and only the wording differs. The member's name and email are
// shown read-only — they are a display copy of what the server already knows
// from the session, not inputs. The server ignores any identity in the request
// body, so these fields being read-only is a courtesy to the member rather
// than the thing that makes the feature safe.
//
// Styling is the project module's `.pj-*` system, so this matches the pages it
// opens over without a new palette.
import React, { useEffect, useRef, useState } from 'react';
import { enquiriesAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Target =
  | { kind: 'project'; id: string }
  | { kind: 'company'; id: string };

const MESSAGE_MAX = 4000;

export default function EnquiryModal({
  target, subjectName, onClose,
}: {
  target: Target;
  /** The project or company name, shown to the member and used in the email. */
  subjectName: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isCompany = target.kind === 'company';
  const actionLabel = isCompany ? 'Connect Now' : 'Enquire Now';

  // The message field is the only thing to fill in, so it takes focus.
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Esc closes, unless a request is in flight — closing mid-submit would leave
  // the member unsure whether their message went.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, sending]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;              // belt: the button is disabled too

    const trimmed = message.trim();
    if (!trimmed) {
      setError('Please write a message before sending.');
      textareaRef.current?.focus();
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await enquiriesAPI.create({
        ...(isCompany ? { companyId: target.id } : { projectId: target.id }),
        message: trimmed,
      });
      // The confirmation comes from the server, so the member is never told
      // "delivered" for something the server recorded as failed.
      setSent(res.data.message
        || 'Your message has been delivered successfully. The concerned team will connect with you soon.');
    } catch (err: any) {
      setError(err?.response?.data?.error
        || 'Your message could not be delivered just now. Please try again in a few minutes.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="pj-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${actionLabel} — ${subjectName}`}
      // A click on the backdrop closes, but not while sending.
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        className="pj-panel"
        style={{ width: 'min(560px, 94vw)', maxHeight: '92vh', overflowY: 'auto', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="pj-panel-title" style={{ marginBottom: 6 }}>{actionLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {subjectName}
            </div>
          </div>
          <button
            type="button"
            className="pj-viewer-close"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {sent ? (
          // Success replaces the form rather than sitting above it: leaving a
          // filled-in form on screen next to "delivered" invites a second send.
          <div style={{ marginTop: 20 }}>
            <div className="pj-ok" style={{ lineHeight: 1.6 }}>{sent}</div>
            <div className="pj-form-actions" style={{ marginTop: 18 }}>
              <button type="button" className="pj-btn pj-btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            {error && <div className="pj-error" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="pj-form-row" style={{ marginBottom: 14 }}>
              <div className="pj-field">
                <label className="pj-label" htmlFor="enq-name">Your name</label>
                <input
                  id="enq-name"
                  className="pj-input"
                  value={user?.name || ''}
                  readOnly
                  // Read-only, not disabled: a disabled field is skipped by
                  // screen readers and keyboard navigation, and the member
                  // should still be able to see and select their own details.
                  style={{ opacity: 0.75, cursor: 'default' }}
                />
              </div>
              <div className="pj-field">
                <label className="pj-label" htmlFor="enq-email">Your email</label>
                <input
                  id="enq-email"
                  className="pj-input"
                  value={user?.email || ''}
                  readOnly
                  style={{ opacity: 0.75, cursor: 'default' }}
                />
              </div>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="enq-message">Message *</label>
              <textarea
                id="enq-message"
                ref={textareaRef}
                className="pj-textarea"
                value={message}
                required
                maxLength={MESSAGE_MAX}
                disabled={sending}
                onChange={(e) => { setMessage(e.target.value); if (error) setError(''); }}
                placeholder={isCompany
                  ? 'Tell them what you would like to discuss…'
                  : 'What would you like to know about this project?'}
                style={{ minHeight: 140 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
                <span className="pj-hint">
                  Your name and email are shared with the {isCompany ? 'company' : 'project'} team so they can reply.
                </span>
                <span className="pj-hint" style={{ whiteSpace: 'nowrap' }}>
                  {message.length}/{MESSAGE_MAX}
                </span>
              </div>
            </div>

            <div className="pj-form-actions" style={{ marginTop: 18 }}>
              <button type="button" className="pj-btn pj-btn-ghost" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              {/* Disabled while in flight, which is what stops a double
                * submission from a double click. The server also collapses an
                * identical repeat within two minutes. */}
              <button type="submit" className="pj-btn pj-btn-primary" disabled={sending || !message.trim()}>
                {sending ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
