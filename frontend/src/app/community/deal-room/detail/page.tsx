'use client';
// src/app/community/deal-room/detail/page.tsx
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { projectsAPI, formatEur } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const RISK_COLORS: Record<string, string> = {
  LOW:    'comm-risk-low',
  MEDIUM: 'comm-risk-medium',
  HIGH:   'comm-risk-high',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'comm-risk-low',
  FUNDED:    'comm-risk-medium',
  CLOSED:    'comm-risk-high',
  CANCELLED: 'comm-risk-high',
};

// ── Invest Modal ───────────────────────────────
function InvestModal({ project, onClose, onInvested }: { project: any; onClose: () => void; onInvested: () => void }) {
  const [amount,  setAmount]  = useState('');
  const [notes,   setNotes]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const minAmount = Math.ceil(project.targetAmount * (project.minInvestmentPct / 100));
  const remaining = project.targetAmount - project.raisedAmount;
  const sharePct  = amount ? ((parseFloat(amount) / project.targetAmount) * 100).toFixed(2) : '0';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await projectsAPI.invest(project.id, { amount: parseFloat(amount), notes });
      onInvested();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Investment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">Invest in {project.title}</div>

        <div style={{ background: 'rgba(200,168,75,0.06)', border: '1px solid rgba(200,168,75,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Target</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{formatEur(project.targetAmount)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Remaining</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{formatEur(remaining)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Min. Investment</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{formatEur(minAmount)} ({project.minInvestmentPct}%)</div>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">Investment Amount (€) *</label>
            <input className="comm-form-input" type="number" min={minAmount} max={remaining}
              placeholder={`Min €${minAmount.toLocaleString()}`}
              value={amount} onChange={e => setAmount(e.target.value)} required />
            {amount && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                = {sharePct}% share of the project
              </div>
            )}
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Notes (optional)</label>
            <textarea className="comm-form-textarea" style={{ minHeight: 70 }} placeholder="Any notes or conditions…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="comm-btn comm-btn-gold" disabled={loading}>
              {loading ? 'Processing…' : 'Confirm Investment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail View ────────────────────────────────
function DealDetailInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);

  const load = () => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    projectsAPI.getOne(id)
      .then(r => setProject(r.data.project))
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 80px' }}>
        <div className="comm-empty">
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} />
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 80px' }}>
        <div className="comm-empty">
          <div className="comm-empty-icon">🔍</div>
          <div className="comm-empty-text">Deal not found</div>
          <div className="comm-empty-sub">This deal may have been removed or is no longer available.</div>
          <Link href="/community/deal-room">
            <button className="comm-btn comm-btn-gold">Back to Deal Room</button>
          </Link>
        </div>
      </div>
    );
  }

  const daysLeft  = Math.ceil((new Date(project.fundingDeadline).getTime() - Date.now()) / 86400000);
  const remaining = project.targetAmount - project.raisedAmount;
  const minAmount = Math.ceil(project.targetAmount * (project.minInvestmentPct / 100));
  const myInvestment = project.investments?.find((i: any) => i.investor?.id === user?.id);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* Back link */}
      <Link href="/community/deal-room" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        ← Back to Deal Room
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="comm-project-cat">{project.category}</span>
            <span className={`comm-project-cat ${STATUS_COLORS[project.status] || ''}`} style={{ background: 'transparent' }}>
              {project.status}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginBottom: 6 }}>
            {project.title}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            by {project.owner?.name}
            {project.owner?.profile?.company ? ` · ${project.owner.profile.company}` : ''}
            {project.location ? ` · ${project.location}` : ''}
          </div>
        </div>
        {project.status === 'ACTIVE' && !myInvestment && !isAdmin && remaining > 0 && (
          <button className="comm-btn comm-btn-gold" onClick={() => setInvestOpen(true)}>
            Invest Now
          </button>
        )}
        {myInvestment && (
          <div style={{ padding: '10px 16px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.25)', borderRadius: 8, color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>
            ✓ You invested {formatEur(myInvestment.amount)}
          </div>
        )}
      </div>

      {/* Description */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Overview</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {project.description}
        </p>
      </div>

      {/* Funding progress */}
      <div style={{ background: 'rgba(200,168,75,0.04)', border: '1px solid rgba(200,168,75,0.15)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--gold)' }}>{formatEur(project.raisedAmount)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>raised of {formatEur(project.targetAmount)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{project.fundingPct}%</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{project.investorCount} investor{project.investorCount === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="comm-progress">
          <div className="comm-progress-fill gold" style={{ width: `${Math.min(project.fundingPct, 100)}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          <span>{formatEur(remaining)} remaining</span>
          <span className={daysLeft <= 3 ? 'comm-risk-high' : ''}>
            {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Deadline passed'}
          </span>
        </div>
      </div>

      {/* Key stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="comm-project-card" style={{ padding: '14px 16px' }}>
          <div className="comm-project-stat-label">Target IRR</div>
          <div className="comm-project-stat-val" style={{ marginTop: 4 }}>
            {project.targetIRR ? `${project.targetIRR}%` : '—'}
          </div>
        </div>
        <div className="comm-project-card" style={{ padding: '14px 16px' }}>
          <div className="comm-project-stat-label">Risk Level</div>
          <div className={`comm-project-stat-val ${RISK_COLORS[project.riskLevel]}`} style={{ marginTop: 4 }}>
            {project.riskLevel}
          </div>
        </div>
        <div className="comm-project-card" style={{ padding: '14px 16px' }}>
          <div className="comm-project-stat-label">Min. Investment</div>
          <div className="comm-project-stat-val" style={{ marginTop: 4 }}>
            {formatEur(minAmount)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{project.minInvestmentPct}% share</div>
        </div>
        <div className="comm-project-card" style={{ padding: '14px 16px' }}>
          <div className="comm-project-stat-label">Share Type</div>
          <div className="comm-project-stat-val" style={{ marginTop: 4 }}>
            {project.shareType === 'LIMITED' ? 'Limited' : 'Total'}
          </div>
        </div>
        <div className="comm-project-card" style={{ padding: '14px 16px' }}>
          <div className="comm-project-stat-label">Deadline</div>
          <div className="comm-project-stat-val" style={{ marginTop: 4, fontSize: 13 }}>
            {new Date(project.fundingDeadline).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Milestones */}
      {project.milestones && project.milestones.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Milestones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {project.milestones.map((m: any) => (
              <div key={m.id} className="comm-project-card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
                  {m.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.description}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>{formatEur(m.amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(m.targetDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Investors */}
      {project.investments && project.investments.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Investors ({project.investments.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {project.investments.map((inv: any) => (
              <div key={inv.id} className="comm-project-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13 }}>{inv.investor?.name || 'Anonymous'}</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{formatEur(inv.amount)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.sharePercentage?.toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {project.documents && project.documents.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {project.documents.map((d: any) => (
              <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="comm-project-card" style={{ padding: '10px 14px', textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13 }}>📄 {d.name || 'Document'}</div>
                <div style={{ fontSize: 11, color: 'var(--gold)' }}>Open →</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {investOpen && <InvestModal project={project} onClose={() => setInvestOpen(false)} onInvested={() => { setInvestOpen(false); load(); }} />}
    </div>
  );
}

export default function DealDetailPage() {
  return (
    <Suspense fallback={
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 80px' }}>
        <div className="comm-empty">
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} />
        </div>
      </div>
    }>
      <DealDetailInner />
    </Suspense>
  );
}
