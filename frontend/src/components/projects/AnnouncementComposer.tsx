'use client';
// src/components/projects/AnnouncementComposer.tsx
//
// The composer behind "Announce Major Update" — the only way to announce a
// project that has already launched.
//
// THERE IS NO "RE-ANNOUNCE" MODE, deliberately. A project is launched once,
// and every message to the community after that has to say what changed. That
// is why the "What's New?" summary is required and has no default: a composer
// that opened with a sentence already written in it is a composer that mails
// the community something nobody actually decided to say.
//
// Styling is the project module's `.pj-*` system, as EnquiryModal does, so it
// matches the page it opens over without inventing a palette.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { projectsAPI, mediaSrc } from '@/lib/api';

interface Option { value: string; label: string }

export interface ComposerOptions {
  audiences: Option[];
  updateCategories: Option[];
  defaults: {
    launchTitle: string;
    launchMessage: string;
  };
  promoDays: number;
  projectUrl: string;
}

const TITLE_MAX = 200;
const MESSAGE_MAX = 4000;
const DETAIL_MAX = 8000;

/**
 * A stable key for this composer session.
 *
 * Generated once, when the composer opens, and reused for every attempt. That
 * is what distinguishes "the send failed and I pressed it again" - same key,
 * so the server recognises the retry and does not announce twice - from "this
 * is a second, different update", which is a new composer and therefore a new
 * key.
 *
 * `crypto.randomUUID` needs a secure context; a plain random string is a fine
 * fallback, because the key only has to be unique, not unguessable.
 */
const newSessionKey = () => {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
};

export default function AnnouncementComposer({
  projectId, projectName, bannerUrl, options, onClose, onSent,
}: {
  projectId: string;
  projectName: string;
  bannerUrl?: string | null;
  options: ComposerOptions;
  onClose: () => void;
  /** Called with the server's own success message once it has been accepted. */
  onSent: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState(options.audiences[0]?.value || 'ALL_ACTIVE_MEMBERS');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sessionKey = useRef(newSessionKey());
  const firstField = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstField.current?.focus(); }, []);

  // Esc closes, unless a request is in flight: closing mid-send would leave
  // the admin unsure whether the community was just mailed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, sending]);

  const banner = bannerUrl ? mediaSrc(bannerUrl) : null;

  // The subject the server will build. Mirrored here rather than guessed: if
  // the two ever disagree, the preview is the thing that is lying.
  const subject = useMemo(
    () => `Project Update – ${projectName}: ${title || '[update title]'}`,
    [projectName, title],
  );

  const canSend = Boolean(title.trim() && message.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !canSend) return;

    setSending(true);
    setError('');
    try {
      const res = await projectsAPI.majorUpdate(projectId, {
        idempotencyKey: sessionKey.current,
        title: title.trim(),
        message: message.trim(),
        detail: detail.trim() || undefined,
        updateCategory: category || undefined,
        audience,
      });
      // The server's own wording, so the admin is never told the mail has
      // arrived when the server only queued it.
      onSent(res.data.message || 'Major update published.');
    } catch (err: any) {
      setError(err?.response?.data?.error
        || 'The update could not be published just now. Please try again — pressing the button '
         + 'again is safe, it will not announce the project twice.');
      setSending(false);
    }
  };

  return (
    <div
      className="pj-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Announce major update — ${projectName}`}
      onClick={() => { if (!sending) onClose(); }}
    >
      <form
        className="pj-panel pj-composer"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="pj-composer-head">
          <div style={{ minWidth: 0 }}>
            <div className="pj-panel-title" style={{ marginBottom: 6 }}>Announce major update</div>
            <div className="pj-composer-subject">{projectName}</div>
          </div>
          <button type="button" className="pj-viewer-close" onClick={onClose}
            disabled={sending} aria-label="Close">×</button>
        </div>

        {banner && (
          <div className="pj-composer-banner">
            <img src={banner} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} />
          </div>
        )}

        <div className="pj-composer-body">
          <div className="pj-field">
            <label className="pj-label" htmlFor="ac-title">
              Update title<span className="pj-req"> *</span>
            </label>
            <input
              id="ac-title"
              ref={firstField}
              className="pj-input"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Phase two approved"
            />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="ac-category">Update category</label>
            <select id="ac-category" className="pj-select" value={category}
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">Not specified</option>
              {options.updateCategories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="ac-message">
              What&rsquo;s New?<span className="pj-req"> *</span>
            </label>
            <textarea
              id="ac-message"
              className="pj-textarea"
              rows={5}
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explain what changed and why members should look at the project again."
            />
            <div className="pj-hint">
              {/* Said plainly, because §6 forbids the portal filling this in:
                  an invented summary is worse than no announcement. */}
              Written by you — nothing here is generated. This is the text members will read as
              the reason to revisit the project. {message.length}/{MESSAGE_MAX}
            </div>
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="ac-detail">Detailed explanation (optional)</label>
            <textarea id="ac-detail" className="pj-textarea" rows={4} value={detail}
              maxLength={DETAIL_MAX} onChange={(e) => setDetail(e.target.value)}
              placeholder="Any further context. Left out of the email if empty." />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="ac-audience">Recipients</label>
            <select id="ac-audience" className="pj-select" value={audience}
              onChange={(e) => setAudience(e.target.value)}>
              {options.audiences.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <div className="pj-hint">
              Pending, frozen and rejected accounts are never included. Each member is
              emailed individually, so no address is shown to anyone else.
            </div>
          </div>

          {/* ── The two previews §6 asks for ── */}
          <div className="pj-preview-pane">
            <div className="pj-preview-label">Email preview</div>
            <div className="pj-preview-mail">
              <div className="pj-preview-subject">
                <span>Subject</span> {subject}
              </div>
              <div className="pj-preview-mail-body">
                <p className="pj-preview-greeting">Hello [member&rsquo;s first name],</p>
                <p>There is an important update to <strong>{projectName}</strong> on the TBC Portal.</p>
                <div className="pj-preview-whatsnew">
                  <div className="pj-preview-whatsnew-label">WHAT&rsquo;S NEW?</div>
                  <p>{message || '[your summary]'}</p>
                </div>
                {detail && <p>{detail}</p>}
                <p className="pj-preview-cta">
                  View Updated Project →{' '}
                  <span className="pj-preview-url">{options.projectUrl}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="pj-preview-pane">
            <div className="pj-preview-label">Community announcement preview</div>
            <div className="pj-preview-post">
              <div className="pj-preview-post-title">{title || projectName}</div>
              <p>{message || '[your summary]'}</p>
              <div className="pj-preview-url">{options.projectUrl}</div>
            </div>
          </div>

          {error && <div className="pj-error">{error}</div>}
        </div>

        <div className="pj-composer-foot">
          <button type="button" className="pj-btn pj-btn-ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="pj-btn pj-btn-primary" disabled={sending || !canSend}>
            {sending ? 'Publishing…' : 'Confirm and Announce'}
          </button>
        </div>
      </form>
    </div>
  );
}
