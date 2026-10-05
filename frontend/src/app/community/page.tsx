'use client';
// src/app/community/page.tsx  - Community Feed (homepage after login)
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { communityAPI, eventsAPI, projectsAPI, formatEur } from '@/lib/api';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

const TIER_COLORS: Record<string, string> = {
  BASIC:      'tier-badge-basic',
  PREMIUM:    'tier-badge-premium',
  ENTERPRISE: 'tier-badge-enterprise',
  ELITE:      'tier-badge-elite',
};

const POST_TYPE_LABELS: Record<string, string> = {
  DEAL: 'Deal', NETWORK: 'Community', EVENT: 'Event', HIRING: 'Hiring', INSIGHT: 'Insight',
};

// ── Compose Modal ─────────────────────────────
function ComposeModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [form, setForm] = useState({ type: 'INSIGHT', content: '', location: '', dealAmount: '', dealIRR: '', dealSpots: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) { setError('Content is required'); return; }
    setLoading(true);
    try {
      await communityAPI.createPost({
        type:       form.type,
        content:    form.content,
        location:   form.location || undefined,
        dealAmount: form.dealAmount ? parseFloat(form.dealAmount) : undefined,
        dealIRR:    form.dealIRR   ? parseFloat(form.dealIRR)    : undefined,
        dealSpots:  form.dealSpots ? parseInt(form.dealSpots)    : undefined,
      });
      onPosted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">Share with the Circle</div>
        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">Post Type</label>
            <select className="comm-form-select" value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="INSIGHT">Insight</option>
              <option value="DEAL">Deal Opportunity</option>
              <option value="NETWORK">Community</option>
              <option value="EVENT">Event</option>
              <option value="HIRING">Hiring</option>
            </select>
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Content *</label>
            <textarea className="comm-form-textarea" placeholder="Share a deal, insight, or opportunity…"
              value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Location</label>
            <input className="comm-form-input" placeholder="e.g. Milan, Italy"
              value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          {form.type === 'DEAL' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="comm-form-group">
                <label className="comm-form-label">Total (€)</label>
                <input className="comm-form-input" type="number" placeholder="5000000"
                  value={form.dealAmount} onChange={e => setForm(p => ({ ...p, dealAmount: e.target.value }))} />
              </div>
              <div className="comm-form-group">
                <label className="comm-form-label">Target IRR %</label>
                <input className="comm-form-input" type="number" placeholder="28"
                  value={form.dealIRR} onChange={e => setForm(p => ({ ...p, dealIRR: e.target.value }))} />
              </div>
              <div className="comm-form-group">
                <label className="comm-form-label">Spots left</label>
                <input className="comm-form-input" type="number" placeholder="3"
                  value={form.dealSpots} onChange={e => setForm(p => ({ ...p, dealSpots: e.target.value }))} />
              </div>
            </div>
          )}
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit"  className="comm-btn comm-btn-primary" disabled={loading}>
              {loading ? 'Posting…' : 'Post to Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Post Card ──────────────────────────────────
function PostCard({ post, onLike }: { post: any; onLike: (id: string) => void }) {
  const { user } = useAuth();
  const photoUrl = post.author?.profilePhoto
    ? (post.author.profilePhoto.startsWith('http') ? post.author.profilePhoto : `${API_URL}${post.author.profilePhoto}`)
    : null;
  const initial = post.author?.name?.charAt(0).toUpperCase() || '?';

  return (
    <article className="comm-post">
      <div className="comm-post-header">
        <div className="comm-post-avatar">
          {photoUrl ? <img src={photoUrl} alt={post.author?.name} /> : initial}
        </div>
        <div className="comm-post-meta">
          <div className="comm-post-author">
            {post.author?.name}
            {' '}
            <span className={`comm-mbadge ${TIER_COLORS[post.author?.membershipTier] || ''}`}>
              {post.author?.membershipTier}
            </span>
          </div>
          <div className="comm-post-sub">
            {post.author?.profile?.company}{post.author?.profile?.country ? ` · ${post.author.profile.country}` : ''}
          </div>
          <div className="comm-post-time">
            {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {post.location ? ` · ${post.location}` : ''}
          </div>
        </div>
        <span className={`comm-post-type type-${post.type.toLowerCase()}`}>
          {POST_TYPE_LABELS[post.type] || post.type}
        </span>
      </div>

      <p className="comm-post-text">{post.content}</p>

      {post.type === 'DEAL' && (post.dealAmount || post.dealIRR || post.dealSpots) && (
        <div className="comm-deal-box">
          {post.dealAmount && (
            <div>
              <div className="comm-deal-stat-val">{formatEur(post.dealAmount)}</div>
              <div className="comm-deal-stat-label">Total round</div>
            </div>
          )}
          {post.dealIRR && (
            <div>
              <div className="comm-deal-stat-val">{post.dealIRR}%+</div>
              <div className="comm-deal-stat-label">Target IRR</div>
            </div>
          )}
          {post.dealSpots && (
            <div>
              <div className="comm-deal-stat-val">{post.dealSpots} spots</div>
              <div className="comm-deal-stat-label">Remaining</div>
            </div>
          )}
        </div>
      )}

      <div className="comm-post-actions">
        <button
          className={`comm-post-action${post.likedByMe ? ' liked' : ''}`}
          onClick={() => onLike(post.id)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={post.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {post.likesCount} {post.likesCount === 1 ? 'like' : 'likes'}
        </button>

        <button className="comm-post-action">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {post.commentsCount} comments
        </button>

        {post.type === 'DEAL' && (
          <Link href="/community/deal-room" className="comm-post-cta gold">
            View Deal Room →
          </Link>
        )}
        {post.type === 'NETWORK' && (
          <Link href="/community/network" className="comm-post-cta">
            View Profile →
          </Link>
        )}

        {/* Delete own post */}
        {user?.id === post.authorId && (
          <button className="comm-post-action" style={{ marginLeft: 'auto', color: 'var(--red)' }}
            onClick={async () => {
              if (!confirm('Delete this post?')) return;
              await communityAPI.deletePost(post.id);
              window.location.reload();
            }}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

// ── Main Page ──────────────────────────────────
export default function CommunityPage() {
  const { user } = useAuth();

  const [posts,     setPosts]     = useState<any[]>([]);
  const [events,    setEvents]    = useState<any[]>([]);
  const [projects,  setProjects]  = useState<any[]>([]);
  const [stats,     setStats]     = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [compose,   setCompose]   = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const userInitial  = user?.name?.charAt(0).toUpperCase() || '?';
  const userPhotoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;

  const loadFeed = useCallback(() => {
    const params: Record<string,string> = {};
    if (typeFilter) params.type = typeFilter;
    communityAPI.getFeed(params)
      .then(r => setPosts(r.data.posts || []))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  useEffect(() => {
    eventsAPI.getAll({ upcoming: 'true', limit: '4' }).then(r => setEvents(r.data.events || [])).catch(() => {});
    projectsAPI.getAll({ status: 'ACTIVE', limit: '3' }).then(r => setProjects(r.data.projects || [])).catch(() => {});
    communityAPI.getStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const handleLike = async (postId: string) => {
    await communityAPI.toggleLike(postId);
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likedByMe ? p.likesCount - 1 : p.likesCount + 1 }
      : p
    ));
  };

  return (
    <div className="comm-main">
      {/* ── Left Sidebar ─────────────────────── */}
      <aside className="comm-sidebar-left">
        <div className="comm-scard">
          <div className="comm-scard-title">Navigate</div>
          {[
            { href: '/community',           label: 'Community Feed',   icon: <GridIcon /> },
            { href: '/community/deal-room', label: 'Deal Room',        icon: <DealIcon /> },
            { href: '/community/network',   label: 'Member Directory', icon: <NetworkIcon /> },
            { href: '/community/events',    label: 'Events & Galas',   icon: <CalIcon /> },
            { href: '/community/messages',  label: 'Messages',         icon: <MsgIcon /> },
            ...(user?.wallet ? [{ href: '/dashboard', label: 'SalBank Wallet', icon: <WalletIcon /> }] : []),
            ...(user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin Panel', icon: <AdminIcon /> }] : []),
          ].map(({ href, label, icon }) => (
            <Link key={href} href={href} className="comm-side-item">
              <span className="comm-side-icon">{icon}</span>
              {label}
            </Link>
          ))}
        </div>

        {stats && (
          <div className="comm-scard">
            <div className="comm-scard-title">Circle Stats</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Members',      val: stats.totalMembers  },
                { label: 'Feed Posts',   val: stats.activePosts   },
                { label: 'Active Deals', val: stats.activeProjects },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{val ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Feed Center ──────────────────────── */}
      <div className="comm-feed">
        {/* Compose bar */}
        <div className="comm-compose" onClick={() => setCompose(true)}>
          <div className="comm-compose-avatar">
            {userPhotoUrl ? <img src={userPhotoUrl} alt={user?.name} /> : userInitial}
          </div>
          <div className="comm-compose-input">Share a deal, insight, or opportunity…</div>
          <button className="comm-btn comm-btn-primary" style={{ padding: '8px 16px', fontSize: 12 }}
            onClick={e => { e.stopPropagation(); setCompose(true); }}>
            Post
          </button>
        </div>

        {/* Type filter tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['', 'DEAL', 'NETWORK', 'EVENT', 'HIRING', 'INSIGHT'].map(t => (
            <button key={t}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: typeFilter === t ? 'var(--blue-dim)' : 'transparent',
                border: `1px solid ${typeFilter === t ? 'rgba(58,111,255,0.3)' : 'var(--border)'}`,
                color: typeFilter === t ? '#3a6fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
              onClick={() => setTypeFilter(t)}
            >
              {t === '' ? 'All' : POST_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="comm-empty">
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="comm-empty">
            <div className="comm-empty-icon">📭</div>
            <div className="comm-empty-text">No posts yet</div>
            <div className="comm-empty-sub">Be the first to share something with the circle.</div>
            <button className="comm-btn comm-btn-primary" onClick={() => setCompose(true)}>
              Create First Post
            </button>
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} onLike={handleLike} />
          ))
        )}
      </div>

      {/* ── Right Sidebar ────────────────────── */}
      <aside className="comm-sidebar-right">
        {/* Upcoming Events */}
        {events.length > 0 && (
          <div className="comm-scard">
            <div className="comm-scard-title">Upcoming Events</div>
            {events.map((ev: any) => {
              const d = new Date(ev.startDate);
              return (
                <div key={ev.id} className="comm-event-row">
                  <div className="comm-event-date">
                    <div className="comm-event-day">{d.getDate()}</div>
                    <div className="comm-event-mon">{d.toLocaleString('en', { month: 'short' }).toUpperCase()}</div>
                  </div>
                  <div>
                    <div className="comm-event-name">{ev.title}</div>
                    <div className="comm-event-loc">{ev.location || (ev.isOnline ? 'Online' : 'TBC')}</div>
                  </div>
                </div>
              );
            })}
            <Link href="/community/events" style={{ fontSize: 11, color: 'var(--blue)', display: 'block', textAlign: 'center', marginTop: 10 }}>
              View all events →
            </Link>
          </div>
        )}

        {/* Wallet widget */}
        {user?.wallet && (
          <div className="comm-scard">
            <div className="comm-scard-title">Your Wallet</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Total Balance</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>
                {formatEur(user.wallet.totalBalance)}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: 'rgba(58,111,255,0.08)', borderRadius: 8, padding: 9 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Invested</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#3a6fff', marginTop: 2 }}>
                  {formatEur(user.wallet.investmentAmount)}
                </div>
              </div>
              <div style={{ background: 'rgba(76,217,138,0.08)', borderRadius: 8, padding: 9 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Profit</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>
                  {formatEur(user.wallet.profitAmount)}
                </div>
              </div>
            </div>
            <Link href="/dashboard">
              <button className="comm-deal-btn" style={{ width: '100%' }}>Go to SalBank →</button>
            </Link>
          </div>
        )}

        {/* Active Deals widget */}
        {projects.length > 0 && (
          <div className="comm-scard" style={{ padding: '18px 18px 6px' }}>
            <div className="comm-scard-title">ACTIVE DEALS</div>

            {projects.map((deal: any, idx: number) => {
              const pct       = deal.targetAmount > 0
                ? Math.round((deal.raisedAmount / deal.targetAmount) * 100) : 0;
              const spotsTotal = deal.minInvestmentPct > 0
                ? Math.floor(100 / deal.minInvestmentPct) : null;
              const spotsLeft  = spotsTotal
                ? spotsTotal - Math.round((deal.raisedAmount / deal.targetAmount) * spotsTotal) : null;
              const showSpots  = spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0;

              return (
                <div key={deal.id} style={idx < projects.length - 1
                  ? { borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }
                  : { paddingBottom: 12 }}>

                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {deal.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {deal.category}{deal.location ? ` · ${deal.location}` : ''}
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 7 }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      width: `${Math.min(pct, 100)}%`,
                      background: 'linear-gradient(90deg,var(--accent-gold),#e8c96b)',
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatEur(deal.raisedAmount)} raised</span>
                    {showSpots
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-gold)' }}>{pct}% funded</span>
                    }
                  </div>

                  <Link href="/community/deal-room">
                    <button className="comm-deal-btn" style={{ width: '100%', fontSize: 12, padding: '9px 0' }}>
                      Join Deal Room
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {compose && (
        <ComposeModal onClose={() => setCompose(false)} onPosted={loadFeed} />
      )}
    </div>
  );
}

// Icons
function GridIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function DealIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>; }
function NetworkIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function CalIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function MsgIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function WalletIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>; }
function AdminIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
