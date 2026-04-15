'use client';
// src/app/community/deal-room/page.tsx
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectsAPI, formatEur } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const RISK_COLORS: Record<string, string> = {
  LOW:    'comm-risk-low',
  MEDIUM: 'comm-risk-medium',
  HIGH:   'comm-risk-high',
};

// ── Create Project Modal ───────────────────────
function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', category: '', targetAmount: '',
    minInvestmentPct: '5', shareType: 'LIMITED', riskLevel: 'MEDIUM',
    fundingDeadline: '', targetIRR: '', location: '',
  });
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
      await projectsAPI.create({
        ...form,
        targetAmount:    parseFloat(form.targetAmount),
        minInvestmentPct: parseFloat(form.minInvestmentPct),
        targetIRR:       form.targetIRR ? parseFloat(form.targetIRR) : undefined,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" style={{ width: 580, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">Submit a Deal</div>
        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">Project Title *</label>
            <input className="comm-form-input" placeholder="e.g. Monaco Riviera Fund" value={form.title} onChange={set('title')} required />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Description *</label>
            <textarea className="comm-form-textarea" placeholder="Describe the opportunity…" value={form.description} onChange={set('description')} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="comm-form-group">
              <label className="comm-form-label">Category *</label>
              <select className="comm-form-select" value={form.category} onChange={set('category')} required>
                <option value="">Select category</option>
                <option value="Real Estate">Real Estate</option>
                <option value="Technology">Technology</option>
                <option value="Hospitality">Hospitality</option>
                <option value="Private Equity">Private Equity</option>
                <option value="Energy">Energy</option>
                <option value="Agriculture">Agriculture</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Target Amount (€) *</label>
              <input className="comm-form-input" type="number" placeholder="5000000" value={form.targetAmount} onChange={set('targetAmount')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Min. Investment %</label>
              <input className="comm-form-input" type="number" min="5" max="100" value={form.minInvestmentPct} onChange={set('minInvestmentPct')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Target IRR %</label>
              <input className="comm-form-input" type="number" placeholder="28" value={form.targetIRR} onChange={set('targetIRR')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Share Type</label>
              <select className="comm-form-select" value={form.shareType} onChange={set('shareType')}>
                <option value="LIMITED">Limited Share</option>
                <option value="TOTAL">Total Share</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Risk Level</label>
              <select className="comm-form-select" value={form.riskLevel} onChange={set('riskLevel')}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Funding Deadline *</label>
              <input className="comm-form-input" type="date" value={form.fundingDeadline} onChange={set('fundingDeadline')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Location</label>
              <input className="comm-form-input" placeholder="e.g. Dubai, UAE" value={form.location} onChange={set('location')} />
            </div>
          </div>
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="comm-btn comm-btn-gold" disabled={loading}>
              {loading ? 'Submitting…' : 'Submit Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

// ── Project Card ───────────────────────────────
function ProjectCard({ project, onInvest, onDelete, isAdmin }: { project: any; onInvest: (p: any) => void; onDelete: (id: string) => void; isAdmin: boolean }) {
  const daysLeft = Math.ceil((new Date(project.fundingDeadline).getTime() - Date.now()) / 86400000);

  return (
    <div className="comm-project-card">
      <div className="comm-project-header">
        <div>
          <div className="comm-project-title">{project.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            by {project.owner?.name}
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
          <div className="comm-project-stat-val">{formatEur(project.targetAmount)}</div>
          <div className="comm-project-stat-label">Target</div>
        </div>
        <div>
          <div className={`comm-project-stat-val ${RISK_COLORS[project.riskLevel]}`}>{project.riskLevel}</div>
          <div className="comm-project-stat-label">Risk</div>
        </div>
        <div>
          <div className="comm-project-stat-val">{project.targetIRR ? `${project.targetIRR}%` : '—'}</div>
          <div className="comm-project-stat-label">Target IRR</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="comm-progress" style={{ marginBottom: 6 }}>
        <div className="comm-progress-fill gold" style={{ width: `${Math.min(project.fundingPct, 100)}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span>{formatEur(project.raisedAmount)} raised · {project.fundingPct}% funded</span>
        <span className={daysLeft <= 3 ? 'comm-risk-high' : ''}>
          {daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/community/deal-room/${project.id}`} style={{ flex: 1 }}>
          <button className="comm-deal-btn" style={{ width: '100%' }}>View Details</button>
        </Link>
        {project.status === 'ACTIVE' && !project.myInvestment && !isAdmin && (
          <button className="comm-deal-btn gold-btn" style={{ flex: 1 }} onClick={() => onInvest(project)}>
            Invest Now
          </button>
        )}
        {project.myInvestment && (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
            ✓ Invested
          </div>
        )}
        {isAdmin && (
          <button
            className="comm-deal-btn"
            style={{ flex: 0, padding: '7px 14px', color: 'var(--red)', borderColor: 'rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.08)' }}
            onClick={() => {
              if (!confirm('Delete this deal?')) return;
              onDelete(project.id);
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────
export default function DealRoomPage() {
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
            Deal Room
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Exclusive co-investment opportunities for circle members.
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <button className="comm-btn comm-btn-gold" onClick={() => setCreateOpen(true)}>
            + Submit Deal
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="comm-form-select" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
          value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Technology">Technology</option>
          <option value="Hospitality">Hospitality</option>
          <option value="Private Equity">Private Equity</option>
          <option value="Energy">Energy</option>
          <option value="Agriculture">Agriculture</option>
          <option value="Healthcare">Healthcare</option>
        </select>
        <select className="comm-form-select" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
          value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
          <option value="">All Risk Levels</option>
          <option value="LOW">Low Risk</option>
          <option value="MEDIUM">Medium Risk</option>
          <option value="HIGH">High Risk</option>
        </select>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="comm-empty"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} /></div>
      ) : projects.length === 0 ? (
        <div className="comm-empty">
          <div className="comm-empty-icon">🏗️</div>
          <div className="comm-empty-text">No active deals right now</div>
          <div className="comm-empty-sub">No opportunities have been listed yet.</div>
          {user?.role === 'ADMIN' && (
            <button className="comm-btn comm-btn-gold" onClick={() => setCreateOpen(true)}>Submit a Deal</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} onInvest={setInvestTarget} onDelete={handleDelete} isAdmin={user?.role === 'ADMIN'} />
          ))}
        </div>
      )}

      {createOpen  && <CreateProjectModal onClose={() => setCreateOpen(false)}  onCreated={loadProjects} />}
      {investTarget && <InvestModal project={investTarget} onClose={() => setInvestTarget(null)} onInvested={loadProjects} />}
    </div>
  );
}
