'use client';
// src/components/admin/InvestmentWizard.tsx
//
// Replaces the old generic "Add Transaction" popup with a purpose-built,
// 3-step wizard for the project investment/profit engine: choose an action
// (Add Investment / Add One-Time Profit / Configure Monthly Profit), fill in
// the type-specific fields with a live preview, then review and confirm.
import { useEffect, useMemo, useState } from 'react';
import { investmentAPI, formatEur } from '@/lib/api';

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
    if (!form.userId) return 'Please select a user.';
    if (actionType === 'INVESTMENT') {
      if (!form.amount || parseFloat(form.amount) <= 0) return 'Enter an investment amount greater than zero.';
      if (!form.investedAt) return 'Please select the investment date.';
    }
    if (actionType === 'ONE_TIME_PROFIT') {
      if (!form.value || parseFloat(form.value) <= 0) return 'Enter an amount/percentage greater than zero.';
      if (!form.effectiveDate) return 'Please select the effective date.';
    }
    if (actionType === 'MONTHLY_CONFIG') {
      if (!form.rate || parseFloat(form.rate) <= 0) return 'Enter a monthly rate greater than zero.';
      if (!form.monthlyEffectiveFrom) return 'Please select the effective-from date.';
    }
    return '';
  };

  const goNext = () => {
    if (step === 1) {
      if (!actionType) { setError('Please choose an action.'); return; }
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
        setSuccessMsg('Investment added — capital and wallet have been updated.');
      } else if (actionType === 'ONE_TIME_PROFIT') {
        await investmentAPI.createOneTimeProfit({
          userId: form.userId, projectId,
          profitType: form.profitType, value: form.value, effectiveDate: form.effectiveDate,
        });
        setSuccessMsg('One-time profit recorded and added to available profit.');
      } else if (actionType === 'MONTHLY_CONFIG') {
        await investmentAPI.setMonthlyProfitConfig({
          userId: form.userId, projectId,
          rate: form.rate, effectiveFrom: form.monthlyEffectiveFrom,
        });
        setSuccessMsg('Monthly profit configured.');
      }
      onSuccess();
      setTimeout(() => { onClose(); }, 1600);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const selectedMember = members.find(m => m.id === form.userId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <p className="modal-title">Add Investment / Profit</p>

        {/* Step indicator */}
        <div style={{ display:'flex', gap:6, marginBottom:20 }}>
          {['Action', 'Details', 'Review & Confirm'].map((label, i) => {
            const n = (i + 1) as Step;
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} style={{ flex:1 }}>
                <div style={{
                  height:4, borderRadius:2, marginBottom:6,
                  background: active || done ? 'var(--accent-gold, #c8a84b)' : 'var(--border)',
                }} />
                <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.03em',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  STEP {n} · {label.toUpperCase()}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Step 1: choose action ── */}
        {step === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { key: 'INVESTMENT', title: 'Add Investment', desc: 'Record new capital a user has invested in a project.' },
              { key: 'ONE_TIME_PROFIT', title: 'Add One-Time Profit', desc: 'A single profit payout - amount or % of capital, not recurring.' },
              { key: 'MONTHLY_CONFIG', title: 'Configure Monthly Profit', desc: 'Set a recurring monthly % that auto-generates on the 15th.' },
            ].map(opt => (
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
              <label className="form-label">USER *</label>
              <select className="filter-select" style={{ width:'100%' }}
                value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value }))}>
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name} - {m.email}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">DEAL ROOM PROJECT</label>
              <select className="filter-select" style={{ width:'100%' }}
                value={form.projectId} onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}>
                <option value={NO_PROJECT}>
                  {loadingProjects ? 'Loading…' : 'No project — general investment'}
                </option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
              </select>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                Projects come from the Deal Room. Leave this on &ldquo;No project&rdquo; to record capital
                that is not tied to a specific deal.
              </p>
            </div>

            {actionType === 'INVESTMENT' && (
              <>
                <div className="form-group">
                  <label className="form-label">INVESTMENT AMOUNT (€) *</label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">INVESTMENT DATE *</label>
                  <input className="form-input" type="date"
                    value={form.investedAt} onChange={e => setForm(p => ({ ...p, investedAt: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <p style={{ fontSize:12, color:'var(--text-muted)' }}>
                    Current capital in this project for this user: <strong style={{ color:'var(--text-primary)' }}>{formatEur(previewCapital)}</strong>.
                    After this investment: <strong style={{ color:'var(--text-primary)' }}>{formatEur(previewCapital + (parseFloat(form.amount) || 0))}</strong>.
                  </p>
                )}
              </>
            )}

            {actionType === 'ONE_TIME_PROFIT' && (
              <>
                <div className="form-group">
                  <label className="form-label">PROFIT TYPE *</label>
                  <select className="filter-select" style={{ width:'100%' }}
                    value={form.profitType}
                    onChange={e => setForm(p => ({ ...p, profitType: e.target.value as any }))}>
                    <option value="ONE_TIME_PERCENT">One-time % of capital</option>
                    <option value="ONE_TIME_AMOUNT">One-time fixed amount (€)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {form.profitType === 'ONE_TIME_PERCENT' ? 'PERCENTAGE (%) *' : 'AMOUNT (€) *'}
                  </label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">EFFECTIVE DATE *</label>
                  <input className="form-input" type="date"
                    value={form.effectiveDate} onChange={e => setForm(p => ({ ...p, effectiveDate: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <p style={{ fontSize:12, color:'var(--text-muted)' }}>
                    Current capital: <strong style={{ color:'var(--text-primary)' }}>{formatEur(previewCapital)}</strong>.{' '}
                    {form.profitType === 'ONE_TIME_PERCENT' && form.value
                      ? <>Profit = {form.value}% × {formatEur(previewCapital)} = <strong style={{ color:'var(--green)' }}>{formatEur(previewCapital * (parseFloat(form.value) || 0) / 100)}</strong>.</>
                      : null}
                    {' '}This profit does not change the invested capital.
                  </p>
                )}
              </>
            )}

            {actionType === 'MONTHLY_CONFIG' && (
              <>
                <div className="form-group">
                  <label className="form-label">MONTHLY PROFIT RATE (%) *</label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">EFFECTIVE FROM *</label>
                  <input className="form-input" type="date"
                    value={form.monthlyEffectiveFrom} onChange={e => setForm(p => ({ ...p, monthlyEffectiveFrom: e.target.value }))} />
                </div>
                {previewCapital !== null && (
                  <div style={{
                    background:'rgba(200,168,75,0.08)', border:'1px solid rgba(200,168,75,0.25)',
                    borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12, color:'var(--text-secondary)', marginTop:4,
                  }}>
                    <div><strong style={{ color:'var(--text-primary)' }}>Investment Capital:</strong> {formatEur(previewCapital)}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Monthly Profit:</strong> {form.rate || 0}%</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Monthly Profit Amount:</strong> {formatEur(previewCapital * (parseFloat(form.rate) || 0) / 100)}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Next Profit Date:</strong> {previewNextDate?.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <p style={{ marginTop:8, color:'var(--text-muted)' }}>
                      Profit is calculated on the invested capital only. Previous profits are not automatically added to the capital.
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
            <div><strong style={{ color:'var(--text-primary)' }}>Action:</strong> {
              actionType === 'INVESTMENT' ? 'Add Investment' :
              actionType === 'ONE_TIME_PROFIT' ? 'Add One-Time Profit' : 'Configure Monthly Profit'
            }</div>
            <div><strong style={{ color:'var(--text-primary)' }}>User:</strong> {selectedMember?.name} ({selectedMember?.email})</div>
            <div><strong style={{ color:'var(--text-primary)' }}>Project:</strong> {selectedProject ? (selectedProject.title || selectedProject.name) : 'No project — general investment'}</div>

            {actionType === 'INVESTMENT' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>Amount:</strong> {formatEur(parseFloat(form.amount) || 0)}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>Date:</strong> {form.investedAt}</div>
              </>
            )}
            {actionType === 'ONE_TIME_PROFIT' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>Type:</strong> {form.profitType === 'ONE_TIME_PERCENT' ? `${form.value}% of capital` : `${formatEur(parseFloat(form.value) || 0)} fixed`}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>Effective Date:</strong> {form.effectiveDate}</div>
              </>
            )}
            {actionType === 'MONTHLY_CONFIG' && (
              <>
                <div><strong style={{ color:'var(--text-primary)' }}>Rate:</strong> {form.rate}% / month, on the 15th</div>
                <div><strong style={{ color:'var(--text-primary)' }}>Effective From:</strong> {form.monthlyEffectiveFrom}</div>
              </>
            )}

            <p style={{ marginTop:4, fontSize:11, color:'var(--text-muted)' }}>
              This action is logged and cannot be undone automatically - double-check before confirming.
            </p>
          </div>
        )}

        {error && step === 3 && <p className="form-error" style={{ marginTop:10 }}>{error}</p>}
        {successMsg && <p style={{ color:'var(--green)', fontSize:13, marginTop:10 }}>{successMsg}</p>}

        <div className="modal-actions">
          {step === 1 ? (
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          ) : (
            <button type="button" className="btn-secondary" onClick={goBack} disabled={submitting}>Back</button>
          )}
          {step < 3 ? (
            <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }} onClick={goNext}>
              Next
            </button>
          ) : (
            <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
              onClick={handleSubmit} disabled={submitting || !!successMsg}>
              {submitting ? 'Submitting…' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
