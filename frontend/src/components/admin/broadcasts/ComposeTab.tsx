'use client';
// src/components/admin/broadcasts/ComposeTab.tsx
//
// Write a broadcast email, preview it live, choose who receives it, send.
//
// The composer-session id is generated once when this tab mounts and resent
// unchanged on every attempt, so a failed request can be retried without
// mailing twice - same idempotency contract as
// components/projects/AnnouncementComposer.tsx's `sessionKey`.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { broadcastsAPI } from '@/lib/api';
import BroadcastRecipientSelector, { RecipientSelection } from './BroadcastRecipientSelector';

const LIMITS = { subject: 200, heading: 200, intro: 300, bodyText: 8000, ctaLabel: 60, ctaUrl: 2000 };

const newSessionId = () => {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
};

export default function ComposeTab({ onSent }: { onSent: () => void }) {
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [intro, setIntro] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  // Everyone, until the admin says otherwise - see BroadcastRecipientSelector
  // for why the mode is sent rather than a resolved list of ids.
  const [recipients, setRecipients] = useState<RecipientSelection>({ mode: 'ALL', userIds: [] });

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewError, setPreviewError] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const sessionId = useRef(newSessionId());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fields = useMemo(
    () => ({ subject, heading, intro, bodyText, ctaLabel, ctaUrl }),
    [subject, heading, intro, bodyText, ctaLabel, ctaUrl],
  );

  // Debounced live preview, same 400ms the tbc-mailer reference app uses -
  // long enough that normal typing does not fire a request per keystroke.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (!heading.trim() && !bodyText.trim() && !subject.trim()) {
      setPreviewHtml('');
      setPreviewSubject('');
      return;
    }
    previewTimer.current = setTimeout(() => {
      broadcastsAPI.preview({ ...fields, previewName: 'Alex Member' })
        .then((res) => {
          setPreviewHtml(res.data.html);
          setPreviewSubject(res.data.subject);
          setPreviewError('');
        })
        .catch((err) => {
          setPreviewError(err?.response?.data?.error || 'Could not render the preview.');
        });
    }, 400);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  // An INCLUDE send with nobody ticked is not a narrower send, it is no send
  // at all - the server answers it with a 400, so the button does not offer it.
  const canSend = Boolean(subject.trim() && heading.trim() && bodyText.trim())
    && !(recipients.mode === 'INCLUDE' && recipients.userIds.length === 0)
    && !sending;

  const reset = () => {
    setSubject(''); setHeading(''); setIntro(''); setBodyText('');
    setCtaLabel(''); setCtaUrl('');
    setRecipients({ mode: 'ALL', userIds: [] });
    sessionId.current = newSessionId();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    setSending(true);
    setError('');
    setResult('');
    try {
      const res = await broadcastsAPI.create({
        subject: subject.trim(),
        heading: heading.trim(),
        intro: intro.trim() || undefined,
        bodyText: bodyText.trim(),
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        selection: recipients,
        sessionId: sessionId.current,
      });
      // The server's own wording, so the admin is never told the mail has
      // arrived when the server only queued it.
      setResult(res.data.message || 'Broadcast queued.');
      reset();
      onSent();
    } catch (err: any) {
      setError(err?.response?.data?.error
        || 'The broadcast could not be sent just now. Please try again — pressing the button '
         + 'again is safe, it will not send twice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="bc-compose" onSubmit={submit}>
      <div className="bc-compose-grid">
        <div className="bc-compose-fields">
          <div className="pj-field">
            <label className="pj-label" htmlFor="bc-subject">
              Subject<span className="pj-req"> *</span>
            </label>
            <input id="bc-subject" className="pj-input" value={subject}
              maxLength={LIMITS.subject} disabled={sending}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What shows up in the inbox" />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="bc-heading">
              Heading<span className="pj-req"> *</span>
            </label>
            <input id="bc-heading" className="pj-input" value={heading}
              maxLength={LIMITS.heading} disabled={sending}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="The large title inside the email" />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="bc-intro">Intro line (optional)</label>
            <input id="bc-intro" className="pj-input" value={intro}
              maxLength={LIMITS.intro} disabled={sending}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="One line shown under the heading" />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="bc-body">
              Message<span className="pj-req"> *</span>
            </label>
            <textarea id="bc-body" className="pj-textarea" rows={8} value={bodyText}
              maxLength={LIMITS.bodyText} disabled={sending}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Write the email. Blank lines start a new paragraph." />
            <div className="pj-hint">{bodyText.length}/{LIMITS.bodyText}</div>
          </div>

          <div className="bc-cta-row">
            <div className="pj-field">
              <label className="pj-label" htmlFor="bc-cta-label">Button label (optional)</label>
              <input id="bc-cta-label" className="pj-input" value={ctaLabel}
                maxLength={LIMITS.ctaLabel} disabled={sending}
                onChange={(e) => setCtaLabel(e.target.value)} placeholder="e.g. Open the portal" />
            </div>
            <div className="pj-field">
              <label className="pj-label" htmlFor="bc-cta-url">Button link (optional)</label>
              <input id="bc-cta-url" className="pj-input" value={ctaUrl}
                maxLength={LIMITS.ctaUrl} disabled={sending}
                onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://… — leave blank for no button" />
            </div>
          </div>

          <BroadcastRecipientSelector value={recipients} onChange={setRecipients} disabled={sending} />

          {error && <div className="pj-error">{error}</div>}
          {result && <div className="bc-success">{result}</div>}

          <div className="bc-compose-foot">
            <button type="button" className="pj-btn pj-btn-ghost" disabled={sending} onClick={reset}>
              Clear
            </button>
            <button type="submit" className="pj-btn pj-btn-primary" disabled={!canSend}>
              {sending ? 'Sending…' : 'Send broadcast'}
            </button>
          </div>
        </div>

        <div className="pj-preview-pane bc-preview-pane">
          <div className="pj-preview-label">Email preview</div>
          {previewError && <div className="pj-error">{previewError}</div>}
          {previewHtml ? (
            <>
              <div className="bc-preview-subject"><span>Subject</span> {previewSubject}</div>
              <iframe
                className="bc-preview-frame"
                title="Email preview"
                sandbox=""
                srcDoc={previewHtml}
              />
            </>
          ) : (
            <div className="pj-hint">Start writing to see a live preview of the email.</div>
          )}
        </div>
      </div>
    </form>
  );
}
