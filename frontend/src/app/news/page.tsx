'use client';
// src/app/news/page.tsx
//
// The member briefing: business headlines with the publisher's snippet and
// image, searchable and filterable by source. The landing page shows the same
// stories as bare headlines; this is where the detail lives.
//
// Search, source and page are all server-side, like the projects listing, so
// the filter never lies about stories beyond the first page. Every card links
// out to the publisher - we hold a snippet, not the article.
import React, { useCallback, useEffect, useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { newsAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isAdminRole } from '@/lib/roles';
import { timeAgo } from '@/lib/timeAgo';
import '@/styles/projects.css';
import '@/styles/news.css';

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
}

interface Source { value: string; count: number }

const PAGE_SIZE = 18;

export default function NewsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
      if (source) params.source = source;
      if (debouncedQ) params.q = debouncedQ;
      const r = await newsAPI.list(params);
      setItems(r.data.items);
      setSources(r.data.sources);
      setPages(r.data.pages);
      setTotal(r.data.total);
    } catch {
      setError('Could not load the news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, source, debouncedQ]);

  useEffect(() => { load(); }, [load]);

  const refreshNow = async () => {
    setRefreshing(true);
    try { await newsAPI.refresh(); await load(); } finally { setRefreshing(false); }
  };

  return (
    <ProtectedLayout>
      <div className="pj-page">
        <div className="pj-head">
          <div>
            <h1 className="pj-title">Business News</h1>
            <div className="pj-sub">
              Headlines from leading business publishers, refreshed every 40 minutes. Stories open on the publisher&apos;s site.
            </div>
          </div>
          {isAdmin && (
            <button className="pj-btn pj-btn-sm" onClick={refreshNow} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          )}
        </div>

        <div className="nw-toolbar">
          <input
            className="pj-input nw-search"
            type="search"
            placeholder="Search headlines…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search headlines"
          />
          <div className="nw-sources" role="group" aria-label="Filter by source">
            <button className={`nw-pill ${source === '' ? 'nw-pill-on' : ''}`} onClick={() => { setSource(''); setPage(1); }}>
              All
            </button>
            {sources.map((s) => (
              <button
                key={s.value}
                className={`nw-pill ${source === s.value ? 'nw-pill-on' : ''}`}
                onClick={() => { setSource(s.value); setPage(1); }}
              >
                {s.value}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="pj-empty">{error}</div>}

        {!error && loading && items.length === 0 && (
          <div className="nw-grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="nw-card nw-skeleton" />)}
          </div>
        )}

        {!error && !loading && items.length === 0 && (
          <div className="pj-empty">
            {debouncedQ || source ? 'No stories match your search.' : 'No headlines yet — check back in a few minutes.'}
          </div>
        )}

        {!error && items.length > 0 && (
          <>
            <div className="nw-count">{total} {total === 1 ? 'story' : 'stories'}</div>
            <div className="nw-grid" style={{ opacity: loading ? 0.6 : 1 }}>
              {items.map((n) => (
                <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="nw-card">
                  {n.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="nw-img"
                      src={n.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="nw-body">
                    <div className="nw-meta">
                      <span className="nw-source">{n.source}</span>
                      <span>{timeAgo(n.publishedAt)}</span>
                    </div>
                    <h2 className="nw-title">{n.title}</h2>
                    {n.summary && <p className="nw-summary">{n.summary}</p>}
                    <span className="nw-read">Read on {n.source} ↗</span>
                  </div>
                </a>
              ))}
            </div>

            {pages > 1 && (
              <div className="nw-pager">
                <button className="pj-btn pj-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Newer</button>
                <span>Page {page} of {pages}</span>
                <button className="pj-btn pj-btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Older →</button>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedLayout>
  );
}
