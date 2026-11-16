'use client';
// src/components/admin/MonthlyFixModal.tsx
//
// A member's monthly fix profit, opened from their detail page. Shows what is
// set today (a % or a fixed amount, with the euros it works out to) and lets an
// admin replace it with "Update fix": enter a percentage and see the amount it
// credits, or enter an amount and see the % it is.
//
// Saving writes a NEW config row rather than editing the old one, so profit
// already credited stays traceable to the rate that produced it (see
// investmentEngine.setMonthlyProfitConfig).
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { investmentAPI, formatEur, formatNumber, formatDate } from '@/lib/api';

interface Member { id: string; name: string; email: string; }

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function MonthlyFixModal({
  member, scopes, onClose, onDone,
}: {
  member: Member;
  // Where this member holds capital or already has a fix set: '' is "no
  // project". Offering every project would mostly be offering €0.
  scopes: { id: string; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [projectId, setProjectId] = useState(scopes[0]?.id ?? '');
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('');
  const [day, setDay] = useState('15');
  const [from, setFrom] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback((cycleDay?: string) => {
    setLoading(true);
    return investmentAPI.previewMonthlyProfit(member.id, projectId || null, cycleDay)
      .then(r => setPreview(r.data.preview))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [member.id, projectId]);

  useEffect(() => { setEditing(false); setError(''); setDone(''); load(); }, [load]);

  // Re-preview the eligible capital when the day being typed changes.
  useEffect(() => {
    if (!editing) return;
    const d = parseInt(day, 10);
    if (d >= 1 && d <= 31) load(day);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, editing]);

  const config = preview?.config || null;
  const eligible: number = preview?.eligibleCapital ?? 0;
  const entered = parseFloat(value) || 0;
  const computedAmount = mode === 'PERCENT' ? (eligible * entered) / 100 : entered;
  const computedPct = mode === 'AMOUNT' && eligible > 0 ? (entered / eligible) * 100 : null;

  const startEdit = () => {
    setError(''); setDone('');
    if (config) {
      setDay(String(config.monthlyProfitDay));
      if (config.fixedAmount != null) { setMode('AMOUNT'); setValue(String(config.fixedAmount)); }
      else { setMode('PERCENT'); setValue(String(config.rate)); }
    } else { setMode('PERCENT'); setValue(''); setDay('15'); }
    setFrom(todayIso());
    setEditing(true);
  };

  const save = async () => {
    if (!(entered > 0)) { setError(t('admin:monthlyFix.errValue')); return; }
    const d = parseInt(day, 10);
    if (!(d >= 1 && d <= 31)) { setError(t('admin:monthlyFix.errDay')); return; }
    setSaving(true); setError('');
    try {
      await investmentAPI.setMonthlyProfitConfig({
        userId: member.id, projectId: projectId || null,
        ...(mode === 'PERCENT' ? { rate: value } : { fixedAmount: value }),
        monthlyProfitDay: d, effectiveFrom: from,
      });
      setDone(t('admin:monthlyFix.saved'));
      setEditing(false);
      onDone();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin:wizard.errors.failed'));
    } finally { setSaving(false); }
  };

  const box: React.CSSProperties = {
    background: 'rgba(200,168,75,0.08)', border: '1px solid rgba(200,168,75,0.25)',
    borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)',
  };
  const strong: React.CSSProperties = { color: 'var(--text-primary)' };

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <p className="modal-title">{t('admin:monthlyFix.title')} — {member.name}</p>

        <div className="form-group">
          <label className="form-label">{t('admin:wizard.projectLabel')}</label>
          <select className="filter-select" style={{ width: '100%' }} value={projectId}
            onChange={e => setProjectId(e.target.value)} disabled={saving}>
            {scopes.map(sc => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
          </select>
        </div>

        {/* What is set today */}
        <div style={box}>
          {loading ? t('common:state.loading') : config ? (
            <>
              <div>
                <strong style={strong}>{t('admin:monthlyFix.current')}:</strong>{' '}
                <span className="ltr-embed">
                  {config.fixedAmount != null
                    ? `${formatEur(config.fixedAmount)} ${t('admin:monthlyFix.fixedPerMonth')}`
                    : `${formatNumber(config.rate)}%`}
                </span>
              </div>
              <div>
                <strong style={strong}>{t('admin:monthlyFix.credit')}:</strong>{' '}
                <span className="ltr-embed">{formatEur(preview.monthlyAmount)}</span>
                {config.fixedAmount == null && eligible > 0 && (
                  <> ({t('admin:monthlyFix.onCapital')} <span className="ltr-embed">{formatEur(eligible)}</span>)</>
                )}
                {config.fixedAmount != null && eligible > 0 && (
                  <> (≈ <span className="ltr-embed">{formatNumber((config.fixedAmount / eligible) * 100)}%</span>)</>
                )}
              </div>
              <div>
                <strong style={strong}>{t('admin:monthlyFix.day')}:</strong> {config.monthlyProfitDay}
                {' · '}
                <strong style={strong}>{t('admin:monthlyFix.next')}:</strong> {formatDate(preview.nextProfitDate)}
              </div>
              {preview && preview.capital > eligible && (
                <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('admin:monthlyFix.laterCapital', { total: formatEur(preview.capital), eligible: formatEur(eligible) })}
                </p>
              )}
              {eligible === 0 && (
                <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('admin:monthlyFix.noCapital')}
                </p>
              )}
            </>
          ) : (
            <strong style={strong}>{t('admin:monthlyFix.notSet')}</strong>
          )}
        </div>

        {done && !editing && <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 10 }}>{done}</p>}

        {/* Update form */}
        {editing && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['PERCENT', 'AMOUNT'] as const).map(m => (
                <button key={m} type="button" disabled={saving}
                  onClick={() => { setMode(m); setValue(''); setError(''); }}
                  style={{
                    flex: 1, padding: '9px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
                    border: mode === m ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                    background: mode === m ? 'rgba(58,111,255,0.08)' : 'transparent', color: 'var(--text-primary)',
                  }}>
                  {m === 'PERCENT' ? t('admin:monthlyFix.byPercent') : t('admin:monthlyFix.byAmount')}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">
                {mode === 'PERCENT' ? t('admin:wizard.monthlyRateLabel') : t('admin:monthlyFix.amountLabel')}
              </label>
              <input className="form-input" type="number" min="0.01" step="0.01" autoFocus
                value={value} onChange={e => { setValue(e.target.value); setError(''); }} />
            </div>

            {mode === 'PERCENT' && eligible === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                {t('admin:monthlyFix.noCapitalHint')}
              </p>
            )}

            {entered > 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                {mode === 'PERCENT' ? (
                  <>{t('admin:monthlyFix.willCredit')}{' '}
                    <strong className="ltr-embed" style={{ color: 'var(--green)' }}>{formatEur(computedAmount)}</strong>{' '}
                    {t('admin:monthlyFix.eachMonth')}
                    {eligible > 0 && <> ({formatNumber(entered)}% {t('admin:monthlyFix.of')} <span className="ltr-embed">{formatEur(eligible)}</span>)</>}
                  </>
                ) : (
                  <>{t('admin:monthlyFix.willCredit')}{' '}
                    <strong className="ltr-embed" style={{ color: 'var(--green)' }}>{formatEur(entered)}</strong>{' '}
                    {t('admin:monthlyFix.eachMonth')}
                    {computedPct != null && <> (≈ {formatNumber(computedPct)}% {t('admin:monthlyFix.of')} <span className="ltr-embed">{formatEur(eligible)}</span>)</>}
                  </>
                )}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('admin:monthlyFix.dayLabel')}</label>
                <input className="form-input" type="number" min="1" max="31" step="1"
                  value={day} onChange={e => setDay(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('admin:wizard.effectiveFromLabel')}</label>
                <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('admin:monthlyFix.note')}
            </p>
          </div>
        )}

        {error && <p className="form-error" style={{ marginTop: 10 }}>{error}</p>}

        <div className="modal-actions">
          {editing ? (
            <>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setEditing(false); setError(''); load(); }}>
                {t('common:action.cancel')}
              </button>
              <button type="button" className="btn-primary" disabled={saving}
                style={{ width: 'auto', padding: '10px 24px' }} onClick={save}>
                {saving ? t('admin:wizard.submittingLabel') : t('admin:monthlyFix.save')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common:action.close')}</button>
              <button type="button" className="btn-primary" disabled={loading}
                style={{ width: 'auto', padding: '10px 24px' }} onClick={startEdit}>
                {config ? t('admin:monthlyFix.update') : t('admin:monthlyFix.setup')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
