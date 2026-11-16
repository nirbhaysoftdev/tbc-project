'use client';
// src/components/admin/InsuranceModal.tsx
//
// A member's annual insurance return.
//
// ADD: the admin gives a date and a %. That % of the member's capital is
// credited as profit for that date right away, and the renewal becomes the same
// date next year - from then on it repeats by itself. Doing it again is "add one
// more insurance".
//
// NOTICE: opened for a member who already has insurance, it says so first (what
// was credited, when it renews next) and offers to add one more.
//
// EDIT (super admin): change the %, move the next renewal date, or switch the
// policy off. The API enforces who may; this only decides which controls to draw.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { insuranceAPI, formatEur, formatNumber, formatDate } from '@/lib/api';

interface Member { id: string; name: string; }
export interface Policy {
  ratePercent: number; renewalDate: string; status: 'ACTIVE' | 'DISABLED';
  lastCreditedAt?: string | null; lastCreditedAmount?: number | null;
}
type View = 'notice' | 'add' | 'edit';

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return toIso(d); };

/** First anniversary of `iso` still ahead of today: when the next automatic credit lands. */
function nextAnniversary(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const plus = (d: Date) => {
    const n = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    return n.getMonth() !== d.getMonth() ? new Date(d.getFullYear() + 1, d.getMonth() + 1, 0) : n;
  };
  let next = plus(new Date(+m[1], +m[2] - 1, +m[3]));
  while (next <= today) next = plus(next);
  return next;
}

export default function InsuranceModal({
  member, policy, capital, canEdit = false, initialView, onClose, onDone,
}: {
  member: Member;
  policy: Policy | null;
  capital: number;
  canEdit?: boolean;
  initialView?: View;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [view, setView] = useState<View>(initialView ?? (policy ? 'notice' : 'add'));
  const [rate, setRate] = useState(policy ? String(policy.ratePercent) : '');
  const [date, setDate] = useState(view === 'edit' && policy ? policy.renewalDate.slice(0, 10) : toIso(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pct = parseFloat(rate) || 0;
  const amount = (capital * pct) / 100;
  const next = view === 'add' ? nextAnniversary(date) : null;

  const run = async (call: () => Promise<any>) => {
    setSaving(true); setError('');
    try { await call(); onDone(); onClose(); }
    catch (err: any) { setError(err.response?.data?.error || t('admin:insurance.saveFailed')); }
    finally { setSaving(false); }
  };

  const goto = (v: View) => {
    setError(''); setView(v);
    setDate(v === 'edit' && policy ? policy.renewalDate.slice(0, 10) : toIso(new Date()));
  };

  const save = () => {
    if (!(pct > 0 && pct <= 100)) { setError(t('admin:insurance.errRate')); return; }
    if (!date) { setError(t('admin:insurance.errDate')); return; }
    return run(() => view === 'edit'
      ? insuranceAPI.update(member.id, { ratePercent: rate, renewalDate: date })
      : insuranceAPI.setup(member.id, { ratePercent: rate, date }));
  };

  const toggle = () => {
    const nextStatus = policy?.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (nextStatus === 'DISABLED' && !window.confirm(t('admin:insurance.confirmDisable', { name: member.name }))) return;
    return run(() => insuranceAPI.update(member.id, { status: nextStatus, ...(nextStatus === 'ACTIVE' ? { renewalDate: date } : {}) }));
  };

  const box: React.CSSProperties = {
    background: 'rgba(200,168,75,0.08)', border: '1px solid rgba(200,168,75,0.25)',
    borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)',
  };
  const strong: React.CSSProperties = { color: 'var(--text-primary)' };

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <p className="modal-title">
          {view === 'edit' ? t('admin:insurance.updateTitle') : view === 'notice' ? t('admin:insurance.noticeTitle') : t('admin:insurance.addTitle')} — {member.name}
        </p>

        {/* ── Already insured ── */}
        {view === 'notice' && policy && (
          <>
            <div style={box}>
              {policy.lastCreditedAt ? (
                <div>
                  <strong style={strong}>{t('admin:insurance.alreadyCredited')}</strong>{' '}
                  <span className="ltr-embed">{formatEur(policy.lastCreditedAmount || 0)}</span> ({formatNumber(policy.ratePercent)}%) · {formatDate(policy.lastCreditedAt)}
                </div>
              ) : (
                <div><strong style={strong}>{t('admin:insurance.rateLabelShort')}:</strong> {formatNumber(policy.ratePercent)}%</div>
              )}
              <div>
                <strong style={strong}>{t('admin:insurance.nextRenewal')}:</strong> {formatDate(policy.renewalDate)}
                {policy.status === 'DISABLED' && <> · <span style={{ color: 'var(--red)' }}>{t('admin:insurance.status.DISABLED')}</span></>}
              </div>
              <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>{t('admin:insurance.autoNote')}</p>
            </div>
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              {canEdit && (
                <button type="button" className="btn-secondary" style={{ marginRight: 'auto' }} onClick={() => goto('edit')}>
                  {t('admin:insurance.editBtn')}
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common:action.close')}</button>
              <button type="button" className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => goto('add')}>
                {t('admin:insurance.addMore')}
              </button>
            </div>
          </>
        )}

        {/* ── Add (date + %) / Edit ── */}
        {view !== 'notice' && (
          <>
            <div className="form-group">
              <label className="form-label">{view === 'edit' ? t('admin:insurance.nextRenewalLabel') : t('admin:insurance.dateLabel')}</label>
              <input className="form-input" type="date"
                {...(view === 'edit' ? { min: tomorrow() } : { max: toIso(new Date()) })}
                value={date} onChange={e => { setDate(e.target.value); setError(''); }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('admin:insurance.rateLabel')}</label>
              <input className="form-input" type="number" min="0.01" max="100" step="0.01" autoFocus
                value={rate} onChange={e => { setRate(e.target.value); setError(''); }} />
            </div>

            <div style={box}>
              <div>
                <strong style={strong}>{t('admin:insurance.capital')}:</strong>{' '}
                <span className="ltr-embed">{formatEur(capital)}</span>
              </div>
              {pct > 0 && (
                <div>
                  <strong style={strong}>{t('admin:insurance.willCredit')}:</strong>{' '}
                  <span className="ltr-embed" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatEur(amount)}</span>
                  {' '}({formatNumber(pct)}%){view === 'add' && date ? <> · {formatDate(date)}</> : null}
                </div>
              )}
              {view === 'add' && next && (
                <div><strong style={strong}>{t('admin:insurance.nextRenewal')}:</strong> {formatDate(next)}</div>
              )}
              <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                {view === 'add' ? t('admin:insurance.addNote') : t('admin:insurance.editNote')}
              </p>
            </div>

            {error && <p className="form-error" style={{ marginTop: 10 }}>{error}</p>}

            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              {view === 'edit' && policy && (
                <button type="button" className="btn-secondary" disabled={saving} onClick={toggle}
                  style={{ marginRight: 'auto', color: policy.status === 'ACTIVE' ? 'var(--red)' : 'var(--green)' }}>
                  {policy.status === 'ACTIVE' ? t('admin:insurance.disable') : t('admin:insurance.enable')}
                </button>
              )}
              <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>{t('common:action.cancel')}</button>
              <button type="button" className="btn-primary" disabled={saving}
                style={{ width: 'auto', padding: '10px 24px' }} onClick={save}>
                {saving ? t('admin:wizard.submittingLabel') : view === 'add' ? t('admin:insurance.creditBtn') : t('admin:insurance.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
