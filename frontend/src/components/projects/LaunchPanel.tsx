'use client';
// src/components/projects/LaunchPanel.tsx
//
// The admin lifecycle panel: where a project is launched, where a major update
// to it is announced, and where its announcement history is read.
//
// A project is launched ONCE. After that the only communication action is
// Announce Major Update, which requires a summary of what changed - there is
// deliberately no plain "re-announce" that would let the community be mailed
// about nothing in particular.
//
// THE THREE STATES ARE SHOWN AS THREE THINGS (§12). "Published" (the project
// status), "officially launched" (the launch record) and "newly launched" (the
// 30-day promotional badge) are different questions with different answers,
// and a panel that collapsed them into one word would be the reason somebody
// re-launched a project that was already live.
//
// WHICH BUTTONS APPEAR comes from the server's own eligibility block, not from
// this component's reading of the status. The server computes it, returns it,
// renders the buttons from it and then checks it again on every action - so
// the panel cannot offer something the endpoint would refuse, and hiding a
// button is never what stops it (§2, §13).
import React, { useCallback, useEffect, useState } from 'react';
import { projectsAPI } from '@/lib/api';
import AnnouncementComposer, { ComposerOptions } from './AnnouncementComposer';

export interface LaunchState {
  status: string;
  launchState: 'NEVER_LAUNCHED' | 'PRE_FEATURE' | 'LAUNCHED';
  launchedAt: string | null;
  launchedBy: { id: string; name: string } | null;
  promoStartedAt: string | null;
  promoRestartCount: number;
  newlyLaunched: boolean;
  newlyLaunchedUntil: string | null;
  newlyLaunchedDaysLeft: number;
  canLaunch: boolean;
  canAnnounce: boolean;
  canRestartPromo: boolean;
  canClassify: boolean;
  needsLaunchReview: boolean;
  blocked: boolean;
  complete: boolean;
  reasons: string[];
}

interface AnnouncementRow {
  id: string;
  type: 'INITIAL_LAUNCH' | 'MAJOR_UPDATE' | 'PROMO_RESTART';
  title: string;
  message: string;
  detail: string | null;
  updateCategory: string | null;
  audience: string;
  adminName: string | null;
  postId: string | null;
  notifiedCount: number;
  promoEndsAt: string | null;
  promoReason: string | null;
  createdAt: string;
  email: {
    state: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'NOT_APPLICABLE';
    recipients: number;
    accepted: number;
    failed: number;
    pending: number;
    failures: string[];
    canRetry: boolean;
  };
}

const TYPE_LABEL: Record<AnnouncementRow['type'], string> = {
  INITIAL_LAUNCH: 'Official launch',
  MAJOR_UPDATE: 'Major update',
  PROMO_RESTART: 'Newly Launched period restarted',
};

// Wording chosen carefully. Nothing here says "delivered": SMTP confirms that
// a mail server accepted a message, and the portal has no way to know what
// happened after that, so claiming delivery would be a guess dressed as a
// fact (§9, §10).
const EMAIL_LABEL: Record<AnnouncementRow['email']['state'], string> = {
  PENDING: 'Queued — not started yet',
  PROCESSING: 'Sending in progress',
  COMPLETED: 'Accepted by the mail server for every recipient',
  PARTIAL: 'Partly failed',
  FAILED: 'Failed',
  NOT_APPLICABLE: 'No email — this action does not send one',
};

const EMAIL_CLASS: Record<AnnouncementRow['email']['state'], string> = {
  PENDING: 'pj-pill-wait',
  PROCESSING: 'pj-pill-wait',
  COMPLETED: 'pj-pill-ok',
  PARTIAL: 'pj-pill-warn',
  FAILED: 'pj-pill-bad',
  NOT_APPLICABLE: 'pj-pill-mute',
};

const asDateTime = (value?: string | null) =>
  (value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const asDate = (value?: string | null) =>
  (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** A plain confirm dialog. Used for the two actions that need one. */
function ConfirmDialog({
  title, message, confirmLabel, busy, children, onCancel, onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  children?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="pj-viewer-overlay" role="dialog" aria-modal="true" aria-label={title}
      onClick={() => { if (!busy) onCancel(); }}>
      <div className="pj-panel pj-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="pj-panel-title" style={{ marginBottom: 12 }}>{title}</div>
        <p className="pj-confirm-text">{message}</p>
        {children}
        <div className="pj-composer-foot" style={{ marginTop: 18 }}>
          {/* Cancel closes and changes nothing. */}
          <button type="button" className="pj-btn pj-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pj-btn pj-btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LaunchPanel({
  projectId, projectName, bannerUrl, onChanged,
}: {
  projectId: string;
  projectName: string;
  bannerUrl?: string | null;
  /** Lets the page refresh the badge and status it shows elsewhere. */
  onChanged?: () => void;
}) {
  const [state, setState] = useState<LaunchState | null>(null);
  const [history, setHistory] = useState<AnnouncementRow[]>([]);
  const [options, setOptions] = useState<ComposerOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [dialog, setDialog] = useState<'launch' | 'promo' | 'classify' | null>(null);
  const [composer, setComposer] = useState(false);
  const [promoReason, setPromoReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    projectsAPI.getLifecycle(projectId)
      .then((res) => {
        setState(res.data.launch);
        setHistory(res.data.announcements || []);
        setOptions(res.data.options);
        setError('');
      })
      .catch((err) => setError(err?.response?.data?.error || 'Could not load the lifecycle for this project.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Email delivery runs in the background, so a panel left open on an
  // announcement that is still sending refreshes itself until the queue
  // drains. It stops as soon as nothing is in flight rather than polling
  // forever.
  const inFlight = history.some((a) => a.email.state === 'PENDING' || a.email.state === 'PROCESSING');
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [inFlight, load]);

  const afterAction = (message: string) => {
    setNotice(message);
    setDialog(null);
    setComposer(false);
    setBusy(false);
    load();
    onChanged?.();
  };

  const run = async (fn: () => Promise<{ data: { message?: string } }>, fallback: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fn();
      afterAction(res.data.message || fallback);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'That action could not be completed.');
      setBusy(false);
      // Reload anyway: a 409 usually means the panel's view of the state is
      // stale, and showing the admin the real state is more useful than
      // leaving them looking at buttons that no longer apply.
      load();
    }
  };

  if (loading && !state) {
    return <div className="pj-panel"><div className="pj-empty">Loading lifecycle…</div></div>;
  }
  if (!state) {
    return <div className="pj-panel"><div className="pj-error">{error || 'Lifecycle unavailable.'}</div></div>;
  }

  const launchedLabel = state.launchState === 'NEVER_LAUNCHED'
    ? 'Never launched'
    : (state.launchState === 'PRE_FEATURE'
      ? 'Needs review'
      : (state.launchedAt ? asDate(state.launchedAt) : 'Launched — date not recorded'));

  return (
    <>
      {/* ── The three states, shown as three states ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Lifecycle</div>

        <div className="pj-facts">
          <div className="pj-fact">
            <div className="pj-fact-label">Publication status</div>
            <div className="pj-fact-value">{state.status}</div>
          </div>
          <div className="pj-fact">
            <div className="pj-fact-label">Official launch</div>
            <div className="pj-fact-value">{launchedLabel}</div>
          </div>
          <div className="pj-fact">
            <div className="pj-fact-label">Launched by</div>
            <div className="pj-fact-value">{state.launchedBy?.name || '—'}</div>
          </div>
          <div className="pj-fact">
            <div className="pj-fact-label">Newly Launched badge</div>
            <div className="pj-fact-value">
              {state.newlyLaunched ? (
                <>
                  <span className="pj-pill pj-pill-ok">Active</span>{' '}
                  <span className="pj-fact-sub">
                    {state.newlyLaunchedDaysLeft} day{state.newlyLaunchedDaysLeft === 1 ? '' : 's'} left
                    {' '}· expires {asDate(state.newlyLaunchedUntil)}
                  </span>
                </>
              ) : (
                <>
                  <span className="pj-pill pj-pill-mute">Not active</span>
                  {state.newlyLaunchedUntil && (
                    <span className="pj-fact-sub"> · expired {asDate(state.newlyLaunchedUntil)}</span>
                  )}
                </>
              )}
            </div>
          </div>
          {state.promoRestartCount > 0 && (
            <div className="pj-fact">
              <div className="pj-fact-label">Promotional restarts</div>
              <div className="pj-fact-value">
                {state.promoRestartCount}
                <span className="pj-fact-sub"> · current period began {asDate(state.promoStartedAt)}</span>
              </div>
            </div>
          )}
        </div>

        {notice && <div className="pj-ok" style={{ marginTop: 14 }}>{notice}</div>}
        {error && <div className="pj-error" style={{ marginTop: 14 }}>{error}</div>}

        {/* A project that predates this module: say what is unknown and ask. */}
        {state.needsLaunchReview && (
          <div className="pj-callout" style={{ marginTop: 14 }}>
            <strong>This project was published before launches were tracked.</strong>
            {' '}No launch date was recorded for it, and none has been invented. Either launch it
            officially now — which announces it to the community and starts the 30-day badge — or
            record that it was launched earlier, which sends nothing and leaves the unknown date
            unknown.
          </div>
        )}

        {state.reasons.length > 0 && !state.canAnnounce && !state.canLaunch && (
          <div className="pj-callout pj-callout-warn" style={{ marginTop: 14 }}>
            {state.reasons.map((reason) => <div key={reason}>{reason}</div>)}
          </div>
        )}

        {/* ── Actions, drawn from the server's eligibility ── */}
        <div className="pj-actions">
          {state.canLaunch && (
            <button type="button" className="pj-btn pj-btn-gold" disabled={busy}
              onClick={() => { setNotice(''); setError(''); setDialog('launch'); }}>
              Launch Project
            </button>
          )}
          {state.canClassify && (
            <button type="button" className="pj-btn" disabled={busy}
              onClick={() => { setNotice(''); setError(''); setDialog('classify'); }}>
              Record as previously launched
            </button>
          )}
          {state.canAnnounce && (
            <button type="button" className="pj-btn pj-btn-primary" disabled={busy}
              onClick={() => { setNotice(''); setError(''); setComposer(true); }}>
              Announce Major Update
            </button>
          )}
          {state.canRestartPromo && (
            <button type="button" className="pj-btn pj-btn-ghost" disabled={busy}
              onClick={() => { setNotice(''); setError(''); setPromoReason(''); setDialog('promo'); }}>
              Restart Newly Launched Period
            </button>
          )}
        </div>

        {state.canAnnounce && (
          <div className="pj-hint" style={{ marginTop: 10 }}>
            This project has already been launched, so it cannot be launched again. Editing it
            never announces anything — use Announce Major Update to tell the community what
            changed.
          </div>
        )}
      </div>

      {/* ── Announcement history (§9) ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Announcement history</div>
        {history.length === 0 ? (
          <div className="pj-hint">Nothing has been announced for this project yet.</div>
        ) : (
          <div className="pj-timeline">
            {history.map((row) => (
              <div className="pj-tl-item" key={row.id}>
                <div className="pj-tl-head">
                  <div style={{ minWidth: 0 }}>
                    <span className={`pj-pill pj-pill-type pj-pill-${row.type.toLowerCase()}`}>
                      {TYPE_LABEL[row.type]}
                    </span>
                    <span className="pj-tl-when">{asDateTime(row.createdAt)}</span>
                    {row.adminName && <span className="pj-tl-who">by {row.adminName}</span>}
                  </div>
                  <span className={`pj-pill ${EMAIL_CLASS[row.email.state]}`}>
                    {EMAIL_LABEL[row.email.state]}
                  </span>
                </div>

                <div className="pj-tl-title">{row.title}</div>
                <div className="pj-tl-message">{row.message}</div>
                {row.detail && <div className="pj-tl-message pj-tl-detail">{row.detail}</div>}
                {row.updateCategory && (
                  <div className="pj-tl-meta">Category: {row.updateCategory}</div>
                )}
                {row.type === 'PROMO_RESTART' && row.promoEndsAt && (
                  <div className="pj-tl-meta">
                    New promotional period until {asDate(row.promoEndsAt)}. No email or community
                    announcement was sent for this.
                  </div>
                )}

                {row.email.state !== 'NOT_APPLICABLE' && (
                  <div className="pj-tl-meta">
                    {/* Counted, and named for what the numbers actually mean. */}
                    {row.email.recipients} recipient{row.email.recipients === 1 ? '' : 's'}
                    {' · '}{row.email.accepted} accepted by the mail server
                    {row.email.pending > 0 && ` · ${row.email.pending} still queued`}
                    {row.email.failed > 0 && ` · ${row.email.failed} failed`}
                    <div className="pj-tl-note">
                      “Accepted” means a mail server took the message. The portal has no delivery
                      confirmation beyond that and does not claim one.
                    </div>
                  </div>
                )}

                <div className="pj-tl-meta">
                  Community announcement:{' '}
                  {row.type === 'PROMO_RESTART'
                    ? 'not applicable'
                    : (row.postId
                      ? `published${row.notifiedCount ? ` · ${row.notifiedCount} members notified` : ''}`
                      : 'not published')}
                </div>

                {row.email.failures.length > 0 && (
                  <div className="pj-tl-errors">
                    {row.email.failures.map((failure, i) => <div key={i}>{failure}</div>)}
                  </div>
                )}

                {row.email.canRetry && (
                  <button type="button" className="pj-btn pj-btn-sm" disabled={busy}
                    onClick={() => run(
                      () => projectsAPI.retryAnnouncement(projectId, row.id),
                      'Failed recipients re-queued.',
                    )}>
                    Retry failed recipients
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      {dialog === 'launch' && (
        <ConfirmDialog
          title="Launch This Project?"
          message={'You are about to officially launch this project. The project will become '
            + 'available to eligible community members, an announcement email will be sent to '
            + 'eligible members, a community notification will be published, and the project will '
            + 'be marked as newly launched for 30 days. Do you want to continue?'}
          confirmLabel="Confirm Launch"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => projectsAPI.launch(projectId), 'Project launched.')}
        />
      )}

      {dialog === 'classify' && (
        <ConfirmDialog
          title="Record as previously launched?"
          message={'This records that the project was launched before the portal tracked launches. '
            + 'No launch date will be invented, no announcement will be sent, and the Newly '
            + 'Launched badge will not start. You will still be able to announce a major update '
            + 'to the project afterwards.'}
          confirmLabel="Record it"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => projectsAPI.classifyLaunch(projectId), 'Recorded.')}
        />
      )}

      {dialog === 'promo' && (
        <ConfirmDialog
          title="Restart Newly Launched Period?"
          message={'This action will mark the project as newly launched for another 30 days. The '
            + 'original launch history will be preserved. Continue only if this project has '
            + 'undergone substantial redevelopment or warrants a renewed launch promotion.'}
          confirmLabel="Restart the period"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(
            () => projectsAPI.restartPromo(projectId, promoReason.trim()),
            'The Newly Launched period has been restarted for 30 days.',
          )}
        >
          <div className="pj-field" style={{ marginTop: 6 }}>
            <label className="pj-label" htmlFor="promo-reason">Reason (recorded in the history)</label>
            <textarea id="promo-reason" className="pj-textarea" rows={3} maxLength={500}
              value={promoReason} onChange={(e) => setPromoReason(e.target.value)}
              placeholder="e.g. Scheme fully redeveloped with new partners and revised terms." />
            <div className="pj-hint">
              No email or community announcement is sent by this action. If the community should
              hear about it, follow up with a major update.
            </div>
          </div>
        </ConfirmDialog>
      )}

      {composer && options && (
        <AnnouncementComposer
          projectId={projectId}
          projectName={projectName}
          bannerUrl={bannerUrl}
          options={options}
          onClose={() => setComposer(false)}
          onSent={afterAction}
        />
      )}
    </>
  );
}
