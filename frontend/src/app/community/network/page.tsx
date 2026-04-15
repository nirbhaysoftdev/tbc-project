'use client';
// src/app/community/network/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { communityAPI, messagesAPI } from '@/lib/api';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

const TIER_COLORS: Record<string, string> = {
  BASIC: 'tier-badge-basic', PREMIUM: 'tier-badge-premium',
  ENTERPRISE: 'tier-badge-enterprise', ELITE: 'tier-badge-elite',
};

export default function NetworkPage() {
  const router = useRouter();
  const [members,  setMembers]  = useState<any[]>([]);
  const [search,   setSearch]   = useState('');
  const [tier,     setTier]     = useState('');
  const [industry, setIndustry] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '24' };
    if (search)   params.search   = search;
    if (tier)     params.tier     = tier;
    if (industry) params.industry = industry;
    communityAPI.getMembers(params)
      .then(r => { setMembers(r.data.members || []); setTotal(r.data.pagination?.total || 0); })
      .finally(() => setLoading(false));
  }, [search, tier, industry, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };

  const msgMember = async (memberId: string) => {
    router.push(`/community/messages?partner=${memberId}`);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginBottom: 4 }}>
          Member Directory
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Connect with {total} verified members across the circle.
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="comm-form-input" style={{ flex: 1, minWidth: 200, padding: '9px 14px', fontSize: 13 }}
          placeholder="Search by name, company, industry…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select className="comm-form-select" style={{ width: 'auto', padding: '9px 12px', fontSize: 12 }}
          value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}>
          <option value="">All Tiers</option>
          <option value="BASIC">Basic</option>
          <option value="PREMIUM">Premium</option>
          <option value="ENTERPRISE">Enterprise</option>
          <option value="ELITE">Elite</option>
        </select>
        <select className="comm-form-select" style={{ width: 'auto', padding: '9px 12px', fontSize: 12 }}
          value={industry} onChange={e => { setIndustry(e.target.value); setPage(1); }}>
          <option value="">All Industries</option>
          <option value="Private Equity">Private Equity</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Technology">Technology</option>
          <option value="Finance">Finance</option>
          <option value="Family Office">Family Office</option>
          <option value="Hospitality">Hospitality</option>
        </select>
        <button type="submit" className="comm-btn comm-btn-primary" style={{ padding: '9px 18px', fontSize: 12 }}>
          Search
        </button>
      </form>

      {/* Grid */}
      {loading ? (
        <div className="comm-empty"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} /></div>
      ) : members.length === 0 ? (
        <div className="comm-empty">
          <div className="comm-empty-icon">🔍</div>
          <div className="comm-empty-text">No members found</div>
          <div className="comm-empty-sub">Try adjusting your search or filters.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {members.map(m => {
            const photo = m.profilePhoto
              ? (m.profilePhoto.startsWith('http') ? m.profilePhoto : `${API_URL}${m.profilePhoto}`)
              : null;
            return (
              <div key={m.id} className="comm-member-card">
                <div className="comm-member-avatar">
                  {photo ? <img src={photo} alt={m.name} /> : m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="comm-member-name">{m.name}</div>
                <div className="comm-member-company">{m.profile?.company || '—'}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <span className={`comm-mbadge ${TIER_COLORS[m.membershipTier]}`}>{m.membershipTier}</span>
                  {m.profile?.industry && (
                    <span className="comm-mbadge" style={{ background: 'rgba(100,100,180,0.12)', color: '#a0a8ff' }}>
                      {m.profile.industry}
                    </span>
                  )}
                </div>
                {m.profile?.bio && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {m.profile.bio}
                  </p>
                )}
                <button
                  className="comm-deal-btn"
                  style={{ width: '100%' }}
                  onClick={() => msgMember(m.id)}
                >
                  Send Message
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 24 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 28 }}>
          <button className="comm-btn comm-btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 14px' }}>
            Page {page} of {Math.ceil(total / 24)}
          </span>
          <button className="comm-btn comm-btn-secondary" disabled={page >= Math.ceil(total / 24)} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
