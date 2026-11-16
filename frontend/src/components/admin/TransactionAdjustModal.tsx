'use client';
// src/components/admin/TransactionAdjustModal.tsx
//
// Super admin: correct a transaction's amount or date, or undo it. What each
// does to the member's balance is described in the popup before it is done, and
// a reason is required - it goes into the activity log and the audit trail.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { superAdminAPI, formatEur } from '@/lib/api';

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Categories the API can change: each has one source record to move with it. */
export const canAdjust = (tx: any) =>
  tx.status === 'COMPLETED' && (
    (tx.category === 'INVESTMENT' && !!tx.investmentId)
    || (tx.category === 'PROFIT' && !!tx.profitRecordId)
    || tx.category === 'ADMIN_CREDIT' || tx.category === 'ADMIN_DEBIT');

export default function TransactionAdjustModal({
  tx, mode, onClose, onDone,
}: {
  tx: any;
  mode: 'edit' | 'undo';
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [amount, setAmount] = useState(String(tx.amount));
  const [date, setDate] = useState(toIso(new Date(tx.createdAt)));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const kind = tx.category === 'INVESTMENT' ? 'INVESTMENT' : tx.category === 'PROFIT' ? 'PROFIT' : 'MANUAL';
  const original = toIso(new Date(tx.createdAt));

  const submit = async () => {
    if (reason.trim().length < 3) { setError(t('admin:txAdjust.errReason')); return; }
    setSaving(true); setError('');
    try {
      if (mode === 'undo') {
        await superAdminAPI.undoTransaction(tx.id, reason.trim());
      } else {
        const amountChanged = parseFloat(amount) !== tx.amount;
        const body: { amount?: number | string; date?: string; reason: string } = { reason: reason.trim() };
        if (amountChanged) body.amount = amount;
        if (date !== original) body.date = date;
        if (!amountChanged && date === original) { setError(t('admin:txAdjust.errNothing')); setSaving(false); return; }
        await superAdminAPI.editTransaction(tx.id, body);
      }
      onDone(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin:txAdjust.failed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <p className="modal-title">
          {mode === 'edit' ? t('admin:txAdjust.editTitle') : t('admin:txAdjust.undoTitle')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {tx.description} · <span className="ltr-embed">{formatEur(tx.amount)}</span> · {original}
        </p>

        {mode === 'edit' && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('admin:txAdjust.amount')}</label>
                <input className="form-input" type="number" min="0.01" step="0.01" autoFocus
                  value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('admin:txAdjust.date')}</label>
                <input className="form-input" type="date" max={toIso(new Date())}
                  value={date} onChange={e => { setDate(e.target.value); setError(''); }} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{t(`admin:txAdjust.editNote.${kind}`)}</p>
          </>
        )}

        {mode === 'undo' && (
          <div style={{
            background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.3)',
            borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12,
          }}>
            {t(`admin:txAdjust.undoNote.${kind}`)}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{t('admin:txAdjust.reason')}</label>
          <input className="form-input" value={reason} maxLength={200}
            onChange={e => { setReason(e.target.value); setError(''); }}
            placeholder={t('admin:txAdjust.reasonPlaceholder')} />
        </div>

        {error && <p className="form-error" style={{ marginTop: 10 }}>{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>{t('common:action.cancel')}</button>
          <button type="button" className="btn-primary" disabled={saving}
            style={{ width: 'auto', padding: '10px 24px', ...(mode === 'undo' ? { background: 'var(--red)' } : {}) }}
            onClick={submit}>
            {saving ? t('admin:wizard.submittingLabel') : mode === 'edit' ? t('admin:txAdjust.saveBtn') : t('admin:txAdjust.undoBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
