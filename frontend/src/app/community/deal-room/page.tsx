'use client';
// src/app/community/deal-room/page.tsx
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { projectsAPI, investmentRequestAPI, formatEur, formatNumber } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isAdminRole, isSuperAdminRole } from '@/lib/roles';

// The stored category values, shared by the create form and the filter so the
// two can never drift. These are DATA, not display text — see
// dealRoom.categoryOption for the labels.
const CATEGORIES = ['Real Estate', 'Technology', 'Hospitality', 'Private Equity', 'Energy', 'Agriculture', 'Healthcare'] as const;

const RISK_COLORS: Record<string, string> = {
  LOW:    'comm-risk-low',
  MEDIUM: 'comm-risk-medium',
  HIGH:   'comm-risk-high',
};

// ── Create Project Modal ───────────────────────
function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation(['community', 'common']);
  const [form, setForm] = useState({
    title: '', description: '', category: '', targetAmount: '',
    minInvestmentPct: '5', shareType: 'LIMITED', riskLevel: 'MEDIUM',
    fundingDeadline: '', targetIRR: '', location: '',
  });
  const [files,   setFiles]   = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Set default deadline to 3 months from today
  useEffect(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    setForm(p => ({ ...p, fundingDeadline: d.toISOString().slice(0, 10) }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await projectsAPI.create({
        ...form,
        targetAmount:    parseFloat(form.targetAmount),
        minInvestmentPct: parseFloat(form.minInvestmentPct),
        targetIRR:       form.targetIRR ? parseFloat(form.targetIRR) : undefined,
      });

      // Media is attached to a project id, so it can only be uploaded once the
      // project exists. The deal is already saved at this point: a failed
      // upload is reported without discarding it.
      const projectId = res.data?.project?.id;
      if (projectId && files.length > 0) {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        try {
          await projectsAPI.uploadMedia(projectId, fd);
        } catch (uploadErr: any) {
          onCreated();
          setError(
            (uploadErr.response?.data?.error || t('community:dealRoom.mediaUploadFailed'))
            + '. The deal was created - open it to upload again.',
          );
          setLoading(false);
          return;
        }
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || t('community:dealRoom.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" style={{ width: 580, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">{t('community:dealRoom.submitDeal')}</div>
        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:dealRoom.titleLabel')}</label>
            <input className="comm-form-input" placeholder={t('community:dealRoom.titlePlaceholder')} value={form.title} onChange={set('title')} required />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:dealRoom.descriptionLabel')}</label>
            <textarea className="comm-form-textarea" placeholder={t('community:dealRoom.descriptionPlaceholder')} value={form.description} onChange={set('description')} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.categoryLabel')}</label>
              {/* `value` is the stored category string (the API filters on it and
                  the admin views group by it), so it stays English while the
                  option TEXT is translated. */}
              <select className="comm-form-select" value={form.category} onChange={set('category')} required>
                <option value="">{t('community:dealRoom.categoryPlaceholder')}</option>
                {[...CATEGORIES, 'Other'].map(c => (
                  <option key={c} value={c}>{t(`community:dealRoom.categoryOption.${c}`, { defaultValue: c })}</option>
                ))}
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.targetAmountLabel')}</label>
              <input className="comm-form-input" type="number" placeholder="5000000" value={form.targetAmount} onChange={set('targetAmount')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.minInvestmentLabel')}</label>
              <input className="comm-form-input" type="number" min="5" max="100" value={form.minInvestmentPct} onChange={set('minInvestmentPct')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.targetIrrLabel')}</label>
              <input className="comm-form-input" type="number" placeholder="28" value={form.targetIRR} onChange={set('targetIRR')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.shareTypeLabel')}</label>
              <select className="comm-form-select" value={form.shareType} onChange={set('shareType')}>
                <option value="LIMITED">{t('community:dealRoom.shareTypeOption.LIMITED')}</option>
                <option value="TOTAL">{t('community:dealRoom.shareTypeOption.TOTAL')}</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.riskLevelLabel')}</label>
              <select className="comm-form-select" value={form.riskLevel} onChange={set('riskLevel')}>
                <option value="LOW">{t('community:dealRoom.riskShort.LOW')}</option>
                <option value="MEDIUM">{t('community:dealRoom.riskShort.MEDIUM')}</option>
                <option value="HIGH">{t('community:dealRoom.riskShort.HIGH')}</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.deadlineLabel')}</label>
              <input className="comm-form-input" type="date" value={form.fundingDeadline} onChange={set('fundingDeadline')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">{t('community:dealRoom.locationLabel')}</label>
              <input className="comm-form-input" placeholder={t('community:dealRoom.locationPlaceholder')} value={form.location} onChange={set('location')} />
            </div>
          </div>
          {/* ── Media ── */}
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:dealRoom.mediaLabel')}</label>
            <input
              className="comm-form-input"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"
              onChange={e => setFiles(Array.from(e.target.files || []))}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              {t('community:dealRoom.mediaHint')}
            </p>
            {files.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap: 4, marginTop: 8 }}>
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                             gap: 10, fontSize: 12 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {f.name}
                    </span>
                    <button type="button"
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ border:'none', background:'none', padding:0, fontSize: 11,
                               color:'var(--red)', cursor:'pointer', flexShrink: 0 }}>
                      {t('community:dealRoom.removeFile')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            {t('community:dealRoom.requestOnlyNote')}
          </p>
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>{t('common:action.cancel')}</button>
            <button type="submit" className="comm-btn comm-btn-gold" disabled={loading}>
              {loading
                ? (files.length > 0 ? t('community:dealRoom.uploading') : t('community:dealRoom.submitting'))
                : t('community:dealRoom.submitDeal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invest Modal ───────────────────────────────
function InvestModal({ project, onClose, onInvested }: { project: any; onClose: () => void; onInvested: () => void }) {
  const { t } = useTranslation(['community', 'common']);
  const [amount,  setAmount]  = useState('');
  const [notes,   setNotes]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const minAmount = Math.ceil(project.targetAmount * (project.minInvestmentPct / 100));
  const remaining = project.targetAmount - project.raisedAmount;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await investmentRequestAPI.create(project.id, { amount: parseFloat(amount), message: notes });
      onInvested();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || t('community:dealRoom.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">{t('community:dealRoom.requestTitle', { title: project.title })}</div>

        <div style={{ background: 'rgba(200,168,75,0.06)', border: '1px solid rgba(200,168,75,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('community:dealRoom.target')}</div>
            <div className="ltr-embed" style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{formatEur(project.targetAmount)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('community:dealRoom.remaining')}</div>
            <div className="ltr-embed" style={{ fontSize: 14, fontWeight: 600 }}>{formatEur(remaining)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('community:dealRoom.minInvestmentShort')}</div>
            <div className="ltr-embed" style={{ fontSize: 14, fontWeight: 600 }}>{formatEur(minAmount)} ({formatNumber(project.minInvestmentPct)}%)</div>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:dealRoom.requestedAmountLabel')}</label>
            <input className="comm-form-input" type="number" min={minAmount}
              placeholder={t('community:dealRoom.minPlaceholder', { amount: formatEur(minAmount) })}
              value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:dealRoom.messageLabel')}</label>
            <textarea className="comm-form-textarea" style={{ minHeight: 70 }} placeholder={t('community:dealRoom.messagePlaceholder')}
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>{t('common:action.cancel')}</button>
            <button type="submit" className="comm-btn comm-btn-gold" disabled={loading}>
              {loading ? t('community:dealRoom.submitting') : t('community:dealRoom.submitRequest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Project Card ───────────────────────────────
function ProjectCard({ project, onInvest, onDelete, isAdmin, canDelete }: { project: any; onInvest: (p: any) => void; onDelete: (id: string) => void; isAdmin: boolean; canDelete: boolean }) {
  const { t } = useTranslation(['community', 'common']);
  const daysLeft = Math.ceil((new Date(project.fundingDeadline).getTime() - Date.now()) / 86400000);

  return (
    <div className="comm-project-card">
      <div className="comm-project-header">
        <div>
          <div className="comm-project-title">{project.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {t('community:dealRoom.by', { name: project.owner?.name })}
            {project.location ? ` · ${project.location}` : ''}
          </div>
        </div>
        <span className="comm-project-cat">{project.category}</span>
      </div>

      <p className="comm-project-desc" style={{ WebkitLineClamp: 2, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>
        {project.description}
      </p>

      <div className="comm-project-stats">
        <div>
          <div className="comm-project-stat-val ltr-embed">{formatEur(project.targetAmount)}</div>
          <div className="comm-project-stat-label">{t('community:dealRoom.target')}</div>
        </div>
        <div>
          <div className={`comm-project-stat-val ${RISK_COLORS[project.riskLevel]}`}>
            {t(`community:dealRoom.riskShort.${project.riskLevel}`, { defaultValue: project.riskLevel })}
          </div>
          <div className="comm-project-stat-label">{t('community:dealRoom.riskLabel')}</div>
        </div>
        <div>
          <div className="comm-project-stat-val ltr-embed">{project.targetIRR ? `${formatNumber(project.targetIRR)}%` : '-'}</div>
          <div className="comm-project-stat-label">{t('community:dealRoom.targetIrr')}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="comm-progress" style={{ marginBottom: 6 }}>
        <div className="comm-progress-fill gold" style={{ width: `${Math.min(project.fundingPct, 100)}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span>{t('community:dealRoom.raisedFunded', { amount: formatEur(project.raisedAmount), percent: formatNumber(project.fundingPct) })}</span>
        <span className={daysLeft <= 3 ? 'comm-risk-high' : ''}>
          {daysLeft > 0 ? t('community:dealRoom.daysLeft', { count: daysLeft }) : t('community:dealRoom.expired')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/community/deal-room/detail?id=${project.id}`} style={{ flex: 1 }}>
          <button className="comm-deal-btn" style={{ width: '100%' }}>{t('common:action.viewDetails')}</button>
        </Link>
        {project.status === 'ACTIVE' && !project.myPendingRequest && !isAdmin && (
          <button className="comm-deal-btn gold-btn" style={{ flex: 1 }} onClick={() => onInvest(project)}>
            {t('community:dealRoom.investNow')}
          </button>
        )}
        {project.myPendingRequest && (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
            {project.myPendingRequest.status === 'APPROVED'
              ? t('community:dealRoom.paymentConfirmed')
              : t('community:dealRoom.requestPending')}
          </div>
        )}
        {!project.myPendingRequest && project.myCapital > 0 && (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
            {t('community:dealRoom.investedAmount', { amount: formatEur(project.myCapital) })}
          </div>
        )}
        {/* Deleting a project is irreversible and touches the investment
            ledger, so it is super admin only — distinct from `isAdmin`, which
            only decides whether the Invest button is shown. */}
        {canDelete && (
          <button
            className="comm-deal-btn"
            style={{ flex: 0, padding: '7px 14px', color: 'var(--red)', borderColor: 'rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.08)' }}
            onClick={() => {
              if (!confirm(t('community:dealRoom.confirmDelete'))) return;
              onDelete(project.id);
            }}
          >
            {t('common:action.delete')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────
export default function DealRoomPage() {
  const { t } = useTranslation(['community', 'common']);
  const { user } = useAuth();
  const [projects,  setProjects]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [category,  setCategory]  = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [investTarget, setInvestTarget] = useState<any>(null);

  const handleDelete = async (id: string) => {
    await projectsAPI.remove(id);
    loadProjects();
  };

  const loadProjects = () => {
    const params: Record<string, string> = { status: 'ACTIVE' };
    if (category)  params.category  = category;
    if (riskLevel) params.riskLevel = riskLevel;
    setLoading(true);
    projectsAPI.getAll(params)
      .then(r => setProjects(r.data.projects || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProjects(); }, [category, riskLevel]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginBottom: 4 }}>
            {t('community:dealRoom.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('community:dealRoom.subtitle')}
          </p>
        </div>
        {isAdminRole(user?.role) && (
          <button className="comm-btn comm-btn-gold" onClick={() => setCreateOpen(true)}>
            {t('community:dealRoom.submitCta')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="comm-form-select" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
          value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('community:dealRoom.allCategories')}</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{t(`community:dealRoom.categoryOption.${c}`, { defaultValue: c })}</option>
          ))}
        </select>
        <select className="comm-form-select" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
          value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
          <option value="">{t('community:dealRoom.allRiskLevels')}</option>
          <option value="LOW">{t('community:dealRoom.riskFilter.LOW')}</option>
          <option value="MEDIUM">{t('community:dealRoom.riskFilter.MEDIUM')}</option>
          <option value="HIGH">{t('community:dealRoom.riskFilter.HIGH')}</option>
        </select>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="comm-empty"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} /></div>
      ) : projects.length === 0 ? (
        <div className="comm-empty">
          <div className="comm-empty-text">{t('community:dealRoom.emptyActive')}</div>
          <div className="comm-empty-sub">{t('community:dealRoom.emptyActiveSub')}</div>
          {isAdminRole(user?.role) && (
            <button className="comm-btn comm-btn-gold" onClick={() => setCreateOpen(true)}>{t('community:dealRoom.submitDeal')}</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} onInvest={setInvestTarget} onDelete={handleDelete}
              isAdmin={isAdminRole(user?.role)} canDelete={isSuperAdminRole(user?.role)} />
          ))}
        </div>
      )}

      {createOpen  && <CreateProjectModal onClose={() => setCreateOpen(false)}  onCreated={loadProjects} />}
      {investTarget && <InvestModal project={investTarget} onClose={() => setInvestTarget(null)} onInvested={loadProjects} />}
    </div>
  );
}
