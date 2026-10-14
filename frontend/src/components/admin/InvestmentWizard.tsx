'use client';
// src/components/admin/InvestmentWizard.tsx
//
// Replaces the old generic "Add Transaction" popup with a purpose-built,
// 3-step wizard for the project investment/profit engine: choose an action
// (Add Investment / Add One-Time Profit / Configure Monthly Profit), fill in
// the type-specific fields with a live preview, then review and confirm.
import { useEffect, useMemo, useState } from 'react';
import { investmentAPI, formatEur, formatDate, formatDateLong, formatNumber } from '@/lib/api';
import { Trans, useTranslation } from 'react-i18next';

type ActionType = 'INVESTMENT' | 'ONE_TIME_PROFIT' | 'MONTHLY_CONFIG';
type Step = 1 | 2 | 3;

interface Member { id: string; name: string; email: string; }
interface Project { id: string; name: string; title?: string; category?: string; totalCapital?: number; investorCount?: number; }

// Capital does not require a project. The picker uses an empty projectId for
// that case, which the API accepts as "no project".
const NO_PROJECT = '';

export default function InvestmentWizard({
  open, onClose, members, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [step, setStep] = useState<Step>(1);
  const [actionType, setActionType] = useState<ActionType | ''>('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    userId: '', projectId: '',
    amount: '', investedAt: todayIso(),
    profitType: 'ONE_TIME_PERCENT' as 'ONE_TIME_AMOUNT' | 'ONE_TIME_PERCENT',
    value: '', effectiveDate: todayIso(),
    rate: '', monthlyEffectiveFrom: todayIso(),
  });

  const [previewCapital, setPreviewCapital] = useState<number | null>(null);
  const [previewNextDate, setPreviewNextDate] = useState<Date | null>(null);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setActionType('');
    setForm({
      userId: '', projectId: '',
      amount: '', investedAt: todayIso(),
      profitType: 'ONE_TIME_PERCENT', value: '', effectiveDate: todayIso(),
      rate: '', monthlyEffectiveFrom: todayIso(),
    });
    setPreviewCapital(null);
    setPreviewNextDate(null);
    setError('');
    setSuccessMsg('');
  };

  useEffect(() => {
    if (!open) return;
    reset();
    setLoadingProjects(true);
    investmentAPI.listProjects()
      .then(r => setProjects(r.data.projects || []))
      .finally(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch current capital for the live monthly-profit preview whenever the
  // user+project selection changes (used for both ONE_TIME and MONTHLY_CONFIG previews).
  useEffect(() => {
    if (!form.userId) { setPreviewCapital(null); return; }
    investmentAPI.previewMonthlyProfit(form.userId, form.projectId)
      .then(r => setPreviewCapital(r.data.preview?.capital ?? 0))
      .catch(() => setPreviewCapital(null));
  }, [form.userId, form.projectId]);

  // Compute the next 15th-of-month preview date client-side for the monthly config step.
  useEffect(() => {
    if (actionType !== 'MONTHLY_CONFIG') return;
    const now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), 15);
    if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    setPreviewNextDate(next);
  }, [actionType, form.projectId]);

  const selectedProject = useMemo(
    () => projects.find(p => p.id === form.projectId) || null,
    [projects, form.projectId],
  );

  const validateStep2 = (): string => {
    if (!form.userId) return t('admin:wizard.errors.user');
    if (actionType === 'INVESTMENT') {
      if (!form.amount || parseFloat(form.amount) <= 0) return t('admin:wizard.errors.amount');
      if (!form.investedAt) return t('admin:wizard.errors.date');
    }
    if (actionType === 'ONE_TIME_PROFIT') {
      if (!form.value || parseFloat(form.value) <= 0) return t('admin:wizard.errors.value');
      if (!form.effectiveDate) return t('admin:wizard.errors.effectiveDate');
    }
    if (actionType === 'MONTHLY_CONFIG') {
      if (!form.rate || parseFloat(form.rate) <= 0) return t('admin:wizard.errors.rate');
      if (!form.monthlyEffectiveFrom) return t('admin:wizard.errors.effectiveFrom');
    }
    return '';
  };

  const goNext = () => {
    if (step === 1) {
      if (!actionType) { setError(t('admin:wizard.errors.action')); return; }
      setError('');
      setStep(2);
      return;
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      setError('');
      setStep(3);
    }
  };

  const goBack = () => {
    setError('');
    setStep(s => (s === 3 ? 2 : 1) as Step);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const projectId = form.projectId || null;
      if (actionType === 'INVESTMENT') {
        await investmentAPI.createInvestment({
          userId: form.userId, projectId,
          amount: form.amount, investedAt: form.investedAt,
        });
        setSuccessMsg(t('admin:wizard.success.investment'));
      } else if (actionType === 'ONE_TIME_PROFIT') {
        await investmentAPI.createOneTimeProfit({
          userId: form.userId, projectId,
          profitType: form.profitType, value: form.value, effectiveDate: form.effectiveDate,
        });
        setSuccessMsg(t('admin:wizard.success.oneTime'));
      } else if (actionType === 'MONTHLY_CONFIG') {
        await investmentAPI.setMonthlyProfitConfig({
          userId: form.userId, projectId,
          rate: form.rate, effectiveFrom: form.monthlyEffectiveFrom,
        });
        setSuccessMsg(t('admin:wizard.success.monthly'));
      }
      onSuccess();
      setTimeout(() => { onClose(); }, 1600);
    } catch (err: any) {
      setError(err.response?.data?.error || t('admin:wizard.errors.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const selectedMember = members.find(m => m.id === form.userId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <p className="modal-title">{t('admin:wizard.modalTitle')}</p>

        {/* Step indicator */}
        <div style={{ display:'flex', gap:6, marginBottom:20 }}>
          {(['action', 'details', 'review'] as const).map((stepKey, i) => {
            const label = t(`admin:wizard.steps.${stepKey}`);
            const n = (i + 1) as Step;
            const active = step === n;
            const done = step > n;
            return (
              <div key={stepKey} style={{ flex:1 }}>
                <div style={{
                  height:4, borderRadius:2, marginBottom:6,
                  background: active || done ? 'var(--accent-gold, #c8a84b)' : 'var(--border)',
                }} />
                <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.03em',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {t('admin:wizard.stepLabel', { number: formatNumber(n), label: label.toUpperCase() })}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Step 1: choose action ── */}
        {step === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {/* Keys only; the titles and descriptions come from
                admin:wizard.actions.<KEY>. The key itself is the ActionType the
                API receives and is never translated. */}
            {(['INVESTMENT', 'ONE_TIME_PROFIT', 'MONTHLY_CONFIG'] as const).map(key => (
              { key, title: t(`admin:wizard.actions.${key}.title`), desc: t(`admin:wizard.actions.${key}.desc`) }
            )).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setActionType(opt.key as ActionType)}
                style={{
                  display:'flex', alignItems:'flex-start', gap:12, textAlign:'left',
                  padding:'14px 16px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                  border: actionType === opt.key ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  background: actionType === opt.key ? 'rgba(58,111,255,0.08)' : 'transparent',
                }}>
                <span>
                  <span style={{ display:'block', fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{opt.title}</span>
                  <span style={{ display:'block', fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: details ── */}
        {step === 2 && (
          <>
            <div className="form-group">
              <label className="form-label">{t('admin:wizard.userLabel')}</label>
              <select className="filter-select" style={{ width:'100%' }}
                value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}>
                <option value="">{t('admin:wizard.selectMemberOption')}</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name} - {m.email}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin:wizard.projectLabel')}</label>
              <select className="filter-select" style={{ width:'100%' }}
                value={form.projectId} onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}>
                <option value={NO_PROJECT}>
                  {loadingProjects ? t('common:state.loading') : t('admin:wizard.noProjectOption')}
                </option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
              </select>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                {t('admin:wizard.projectHint')}
              </p>
            </div>

            {actionType === 'INVESTMENT' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.amountLabel')}</label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.dateLabel')}</label>
                  <input className="form-input" type="date"
                    value={form.investedAt} onChange={e => setForm(p => ({ ...p, investedAt: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <p style={{ fontSize:12, color:'var(--text-muted)' }}>
                    <Trans
                      i18nKey="admin:wizard.capitalPreview"
                      values={{
                        current: formatEur(previewCapital),
                        after: formatEur(previewCapital + (parseFloat(form.amount) || 0)),
                      }}
                      components={[
                        <span key="0" />,
                        <strong key="1" style={{ color:'var(--text-primary)' }} />,
                        <span key="2" />,
                        <strong key="3" style={{ color:'var(--text-primary)' }} />,
                      ]}
                    />
                  </p>
                )}
              </>
            )}

            {actionType === 'ONE_TIME_PROFIT' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.profitTypeLabel')}</label>
                  <select className="filter-select" style={{ width:'100%' }}
                    value={form.profitType}
                    onChange={e => setForm(p => ({ ...p, profitType: e.target.value as any }))}>
                    <option value="ONE_TIME_PERCENT">{t('admin:wizard.profitPercentOption')}</option>
                    <option value="ONE_TIME_AMOUNT">{t('admin:wizard.profitAmountOption')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {form.profitType === 'ONE_TIME_PERCENT' ? t('admin:wizard.percentageLabel') : t('admin:wizard.amountOnlyLabel')}
                  </label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.effectiveDateLabel')}</label>
                  <input className="form-input" type="date"
                    value={form.effectiveDate} onChange={e => setForm(p => ({ ...p, effectiveDate: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <p style={{ fontSize:12, color:'var(--text-muted)' }}>
                    <Trans
                      i18nKey="admin:wizard.currentCapital"
                      values={{ amount: formatEur(previewCapital) }}
                      components={[<span key="0" />, <strong key="1" style={{ color:'var(--text-primary)' }} />]}
                    />{' '}
                    {form.profitType === 'ONE_TIME_PERCENT' && form.value ? (
                      <>
                        {t('admin:wizard.profitFormula', {
                          rate: formatNumber(parseFloat(form.value) || 0),
                          capital: formatEur(previewCapital),
                        })}
                        <strong style={{ color:'var(--green)' }}>
                          {formatEur(previewCapital * (parseFloat(form.value) || 0) / 100)}
                        </strong>.
                      </>
                    ) : null}
                    {' '}{t('admin:wizard.profitNote')}
                  </p>
                )}
              </>
            )}

            {actionType === 'MONTHLY_CONFIG' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.monthlyRateLabel')}</label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin:wizard.effectiveFromLabel')}</label>
                  <input className="form-input" type="date"
                    value={form.monthlyEffectiveFrom} onChange={e => setForm(p => ({ ...p, monthlyEffectiveFrom: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <div style={{
                    background:'rgba(200,168,75,0.08)', border:'1px solid rgba(200,168,75,0.25)',
                    borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12, color:'var(--text-secondary)', marginTop:4,
                  }}>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.investmentCapital')}</strong> <span className="ltr-embed">{formatEur(previewCapital)}</span></div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.monthlyProfit')}</strong> <span className="ltr-embed">{formatNumber(parseFloat(form.rate) || 0)}%</span></div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.monthlyProfitAmount')}</strong> <span className="ltr-embed">{formatEur(previewCapital * (parseFloat(form.rate) || 0) / 100)}</span></div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.nextProfitDate')}</strong> {previewNextDate ? formatDateLong(previewNextDate) : '-'}</div>
                    <p style={{ marginTop:8, color:'var(--text-muted)' }}>
                      {t('admin:wizard.monthlyNote')}
                    </p>
                  </div>
                )}
              </>
            )}

            {error && <p className="form-error" style={{ marginTop:10 }}>{error}</p>}
          </>
        )}

        {/* ── Step 3: review ── */}
        {step === 3 && (
          <div style={{
            background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)', padding:'14px 16px', fontSize:13, color:'var(--text-secondary)',
            display:'flex', flexDirection:'column', gap:8,
          }}>
            <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewAction')}</strong>{' '}
              {actionType ? t(`admin:wizard.actions.${actionType}.title`) : ''}</div>
            <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewUser')}</strong> {selectedMember?.name} (<span className="ltr-embed">{selectedMember?.email}</span>)</div>
            <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewProject')}</strong> {selectedProject ? (selectedProject.title || selectedProject.name) : t('admin:wizard.noProjectOption')}</div>

            {actionType === 'INVESTMENT' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewAmount')}</strong> <span className="ltr-embed">{formatEur(parseFloat(form.amount) || 0)}</span></div>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewDate')}</strong> {formatDate(form.investedAt)}</div>
              </>
            )}
            {actionType === 'ONE_TIME_PROFIT' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewType')}</strong>{' '}
                  {form.profitType === 'ONE_TIME_PERCENT'
                    ? t('admin:wizard.percentOfCapital', { value: formatNumber(parseFloat(form.value) || 0) })
                    : t('admin:wizard.fixedAmount', { amount: formatEur(parseFloat(form.value) || 0) })}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewEffectiveDate')}</strong> {formatDate(form.effectiveDate)}</div>
              </>
            )}
            {actionType === 'MONTHLY_CONFIG' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewRate')}</strong>{' '}
                  {t('admin:wizard.ratePerMonth', { rate: formatNumber(parseFloat(form.rate) || 0) })}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:wizard.reviewEffectiveFrom')}</strong> {formatDate(form.monthlyEffectiveFrom)}</div>
              </>
            )}

            <p style={{ marginTop:4, fontSize:11, color:'var(--text-muted)' }}>
              {t('admin:wizard.reviewWarning')}
            </p>
          </div>
        )}

        {error && step === 3 && <p className="form-error" style={{ marginTop:10 }}>{error}</p>}
        {successMsg && <p style={{ color:'var(--green)', fontSize:13, marginTop:10 }}>{successMsg}</p>}

        <div className="modal-actions">
          {step === 1 ? (
            <button type="button" className="btn-secondary" onClick={onClose}>{t('common:action.cancel')}</button>
          ) : (
            <button type="button" className="btn-secondary" onClick={goBack} disabled={submitting}>{t('common:action.back')}</button>
          )}
          {step < 3 ? (
            <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }} onClick={goNext}>
              {t('admin:wizard.next')}
            </button>
          ) : (
            <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
              onClick={handleSubmit} disabled={submitting || !!successMsg}>
              {submitting ? t('admin:wizard.submittingLabel') : t('admin:wizard.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
