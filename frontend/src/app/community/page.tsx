'use client';
// src/app/community/page.tsx  - Community Feed (homepage after login)
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { communityAPI, eventsAPI, projectsAPI, formatEur, formatDate, formatNumber } from '@/lib/api';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

// The post `type` is a database enum and is never translated. Its LABEL comes
// from the community namespace, which is why this is now just the ordered list
// of enum values rather than a label map.
const POST_TYPES = ['DEAL', 'NETWORK', 'EVENT', 'HIRING', 'INSIGHT'] as const;

// ── Compose Modal ─────────────────────────────
function ComposeModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { t } = useTranslation(['community', 'common']);
  const [form, setForm] = useState({ type: 'INSIGHT', content: '', location: '', dealAmount: '', dealIRR: '', dealSpots: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) { setError(t('community:compose.contentRequired')); return; }
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
      setError(err.response?.data?.error || t('community:compose.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">{t('community:compose.title')}</div>
        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:compose.postTypeLabel')}</label>
            <select className="comm-form-select" value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="INSIGHT">{t('community:postType.INSIGHT')}</option>
              <option value="DEAL">{t('community:postType.dealOpportunity')}</option>
              <option value="NETWORK">{t('community:postType.NETWORK')}</option>
              <option value="EVENT">{t('community:postType.EVENT')}</option>
              <option value="HIRING">{t('community:postType.HIRING')}</option>
            </select>
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:compose.contentLabel')}</label>
            <textarea className="comm-form-textarea" placeholder={t('community:compose.contentPlaceholder')}
              value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">{t('community:compose.locationLabel')}</label>
            <input className="comm-form-input" placeholder={t('community:compose.locationPlaceholder')}
              value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          {form.type === 'DEAL' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="comm-form-group">
                <label className="comm-form-label">{t('community:compose.totalLabel')}</label>
                <input className="comm-form-input" type="number" placeholder="5000000"
                  value={form.dealAmount} onChange={e => setForm(p => ({ ...p, dealAmount: e.target.value }))} />
              </div>
              <div className="comm-form-group">
                <label className="comm-form-label">{t('community:compose.irrLabel')}</label>
                <input className="comm-form-input" type="number" placeholder="28"
                  value={form.dealIRR} onChange={e => setForm(p => ({ ...p, dealIRR: e.target.value }))} />
              </div>
              <div className="comm-form-group">
                <label className="comm-form-label">{t('community:compose.spotsLabel')}</label>
                <input className="comm-form-input" type="number" placeholder="3"
                  value={form.dealSpots} onChange={e => setForm(p => ({ ...p, dealSpots: e.target.value }))} />
              </div>
            </div>
          )}
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>{t('common:action.cancel')}</button>
            <button type="submit"  className="comm-btn comm-btn-primary" disabled={loading}>
              {loading ? t('community:compose.submitting') : t('community:compose.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Post Card ──────────────────────────────────
function PostCard({ post, onLike }: { post: any; onLike: (id: string) => void }) {
  const { t } = useTranslation(['community', 'common']);
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
          </div>
          <div className="comm-post-sub">
            {post.author?.profile?.company}{post.author?.profile?.country ? ` · ${post.author.profile.country}` : ''}
          </div>
          <div className="comm-post-time">
            {formatDate(post.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
            {post.location ? ` · ${post.location}` : ''}
          </div>
        </div>
        <span className={`comm-post-type type-${post.type.toLowerCase()}`}>
          {/* defaultValue keeps an unknown future enum readable rather than
              rendering a raw key (§3.8). */}
          {t(`community:postType.${post.type}`, { defaultValue: post.type })}
        </span>
      </div>

      {/* post.content arrives already translated by the API when a
          translation exists, and in English otherwise. */}
      <p className="comm-post-text">{post.content}</p>

      {post.type === 'DEAL' && (post.dealAmount || post.dealIRR || post.dealSpots) && (
        <div className="comm-deal-box">
          {post.dealAmount && (
            <div>
              <div className="comm-deal-stat-val ltr-embed">{formatEur(post.dealAmount)}</div>
              <div className="comm-deal-stat-label">{t('community:feed.deal.totalRound')}</div>
            </div>
          )}
          {post.dealIRR && (
            <div>
              <div className="comm-deal-stat-val ltr-embed">{formatNumber(post.dealIRR)}%+</div>
              <div className="comm-deal-stat-label">{t('community:feed.deal.targetIrr')}</div>
            </div>
          )}
          {post.dealSpots && (
            <div>
              <div className="comm-deal-stat-val">{t('community:feed.deal.spots', { count: post.dealSpots })}</div>
              <div className="comm-deal-stat-label">{t('community:feed.deal.remaining')}</div>
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
          {/* i18next picks the plural form from the locale's own rules —
              Russian has three and Arabic six, which an English
              `count === 1 ? ... : ...` cannot express. */}
          {t('community:feed.likes', { count: post.likesCount })}
        </button>

        <button className="comm-post-action">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {t('community:feed.comments', { count: post.commentsCount })}
        </button>

        {post.type === 'DEAL' && (
          <Link href="/community/deal-room" className="comm-post-cta gold">
            {t('community:feed.viewDealRoom')}
          </Link>
        )}
        {post.type === 'NETWORK' && (
          <Link href="/community/network" className="comm-post-cta">
            {t('community:feed.viewProfile')}
          </Link>
        )}

        {/* Delete own post */}
        {user?.id === post.authorId && (
          <button className="comm-post-action" style={{ marginInlineStart: 'auto', color: 'var(--red)' }}
            onClick={async () => {
              if (!confirm(t('community:feed.confirmDeletePost'))) return;
              await communityAPI.deletePost(post.id);
              window.location.reload();
            }}>
            {t('common:action.delete')}
          </button>
        )}
      </div>
    </article>
  );
}

// ── Main Page ──────────────────────────────────
export default function CommunityPage() {
  const { t } = useTranslation(['community', 'common']);
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
      {/* ── Feed Center ──────────────────────── */}
      <div className="comm-feed">
        {/* Compose bar */}
        <div className="comm-compose" onClick={() => setCompose(true)}>
          <div className="comm-compose-avatar">
            {userPhotoUrl ? <img src={userPhotoUrl} alt={user?.name} /> : userInitial}
          </div>
          <div className="comm-compose-input">{t('community:feed.composePrompt')}</div>
          <button className="comm-btn comm-btn-primary" style={{ padding: '8px 16px', fontSize: 12 }}
            onClick={e => { e.stopPropagation(); setCompose(true); }}>
            {t('community:feed.post')}
          </button>
        </div>

        {/* Type filter tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* `''` is the "no filter" sentinel sent to the API. Renamed from
              `t` to `pt` so it no longer shadows the translator function. */}
          {['', ...POST_TYPES].map(pt => (
            <button key={pt || 'all'}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: typeFilter === pt ? 'var(--blue-dim)' : 'transparent',
                border: `1px solid ${typeFilter === pt ? 'rgba(58,111,255,0.3)' : 'var(--border)'}`,
                color: typeFilter === pt ? '#3a6fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
              onClick={() => setTypeFilter(pt)}
            >
              {pt === '' ? t('community:feed.filterAll') : t(`community:postType.${pt}`)}
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
            <div className="comm-empty-text">{t('community:feed.empty')}</div>
            <div className="comm-empty-sub">{t('community:feed.emptySub')}</div>
            <button className="comm-btn comm-btn-primary" onClick={() => setCompose(true)}>
              {t('community:feed.createFirst')}
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
        {/* Community stats. Moved here when the left column was removed — the
          * real app sidebar now carries navigation, but these figures are not
          * navigation and live nowhere else. */}
        {stats && (
          <div className="comm-scard">
            <div className="comm-scard-title">{t('community:feed.stats.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'members', label: t('community:feed.stats.members'), val: stats.totalMembers  },
                { key: 'posts',   label: t('community:feed.stats.posts'),   val: stats.activePosts   },
                { key: 'deals',   label: t('community:feed.stats.deals'),   val: stats.activeProjects },
              ].map(({ key, label, val }) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{val != null ? formatNumber(val) : '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {events.length > 0 && (
          <div className="comm-scard">
            <div className="comm-scard-title">{t('community:feed.upcomingEvents')}</div>
            {events.map((ev: any) => {
              const d = new Date(ev.startDate);
              return (
                <div key={ev.id} className="comm-event-row">
                  <div className="comm-event-date">
                    {/* Day number and month abbreviation both follow the
                        active locale rather than a hardcoded 'en'. */}
                    <div className="comm-event-day">{formatNumber(d.getDate())}</div>
                    <div className="comm-event-mon">{formatDate(d, { month: 'short' }).toUpperCase()}</div>
                  </div>
                  <div>
                    <div className="comm-event-name">{ev.title}</div>
                    <div className="comm-event-loc">
                      {ev.location || (ev.isOnline ? t('community:feed.online') : t('community:feed.eventLocationTbc'))}
                    </div>
                  </div>
                </div>
              );
            })}
            <Link href="/community/events" style={{ fontSize: 11, color: 'var(--blue)', display: 'block', textAlign: 'center', marginTop: 10 }}>
              {t('community:feed.viewAllEvents')}
            </Link>
          </div>
        )}

        {/* Wallet widget */}
        {user?.wallet && (
          <div className="comm-scard">
            <div className="comm-scard-title">{t('community:feed.wallet.title')}</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{t('community:feed.wallet.totalBalance')}</div>
              <div className="ltr-embed" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>
                {formatEur(user.wallet.totalBalance)}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: 'rgba(58,111,255,0.08)', borderRadius: 8, padding: 9 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('community:feed.wallet.invested')}</div>
                <div className="ltr-embed" style={{ fontSize: 13, fontWeight: 500, color: '#3a6fff', marginTop: 2 }}>
                  {formatEur(user.wallet.investmentAmount)}
                </div>
              </div>
              <div style={{ background: 'rgba(76,217,138,0.08)', borderRadius: 8, padding: 9 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('community:feed.wallet.profit')}</div>
                <div className="ltr-embed" style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>
                  {formatEur(user.wallet.profitAmount)}
                </div>
              </div>
            </div>
            <Link href="/dashboard">
              <button className="comm-deal-btn" style={{ width: '100%' }}>{t('community:feed.wallet.goToWallet')}</button>
            </Link>
          </div>
        )}

        {/* Active Deals widget */}
        {projects.length > 0 && (
          <div className="comm-scard" style={{ padding: '18px 18px 6px' }}>
            <div className="comm-scard-title">{t('community:feed.activeDeals')}</div>

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
                    {/* `category` is free-form text an admin typed, not an
                        enum, so there is no key to look up: it is deliberately
                        excluded from the translation registry (see
                        backend services/i18n/translatable.js) and rendered as
                        stored. The location is likewise admin-entered. */}
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
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('community:feed.raised', { amount: formatEur(deal.raisedAmount) })}
                    </span>
                    {showSpots
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{t('community:feed.spotsLeft', { count: spotsLeft })}</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-gold)' }}>{t('community:feed.funded', { percent: formatNumber(pct) })}</span>
                    }
                  </div>

                  <Link href="/community/deal-room">
                    <button className="comm-deal-btn" style={{ width: '100%', fontSize: 12, padding: '9px 0' }}>
                      {t('community:feed.joinDealRoom')}
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
