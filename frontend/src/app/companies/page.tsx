'use client';
// src/app/companies/page.tsx
//
// The companies listing: search, five filters, sorting and a grid/list switch.
//
// Every control is server-side, like the projects listing. Filtering or sorting
// one page of results in the browser would quietly lie as soon as there is more
// than one page, so each change refetches with the query it describes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import CompanyCard, { CompanySummary, prettyCategory } from '@/components/companies/CompanyCard';
import { companiesAPI, formatEur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';
import '@/styles/companies.css';
import { isAdminRole } from '@/lib/roles';

interface Facets {
  categories: { value: string; count: number }[];
  locations: { value: string; count: number }[];
  owners: { id: string; name: string }[];
  statuses: string[];
  valuation: { min: number; max: number };
}

const SORTS = [
  { value: 'newest',           label: 'Newest first' },
  { value: 'oldest',           label: 'Oldest first' },
  { value: 'updated',          label: 'Recently updated' },
  { value: 'name_asc',         label: 'Name: A–Z' },
  { value: 'name_desc',        label: 'Name: Z–A' },
  { value: 'valuation_desc',   label: 'Valuation: high to low' },
  { value: 'valuation_asc',    label: 'Valuation: low to high' },
  { value: 'established_desc', label: 'Most recently established' },
];

const PAGE_SIZE = 12;

const EMPTY_FILTERS = {
  category: '',
  location: '',
  status: '',
  ownerId: '',
  minValuation: '',
  maxValuation: '',
};

function CompaniesPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');   // what is typed
  const [query, setQuery] = useState('');     // what has been sent
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // A per-browser preference, so localStorage is the right home. Read in an
  // effect rather than in useState because a static export renders this page
  // on the server first, where localStorage does not exist.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tbc_companies_view');
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch { /* private mode: the default is fine */ }
  }, []);

  const chooseView = (next: 'grid' | 'list') => {
    setView(next);
    try { localStorage.setItem('tbc_companies_view', next); } catch { /* ignore */ }
  };

  // Debounce the search box: one request per pause, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 320);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: String(PAGE_SIZE), page: String(page), sort };
    if (query) p.q = query;
    Object.entries(filters).forEach(([key, value]) => { if (value) p[key] = value; });
    // An admin's listing includes drafts and archived profiles, which is what
    // makes this page usable for managing the directory.
    if (!filters.status && isAdmin) p.status = 'ALL';
    return p;
  }, [query, filters, sort, page, isAdmin]);

  // Guards against an older response overwriting a newer one when two requests
  // are in flight (type a letter, then change a filter).
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    companiesAPI.getAll(params)
      .then((res) => {
        if (id !== requestId.current) return;
        setCompanies(res.data.companies || []);
        setTotal(res.data.pagination?.total ?? 0);
        setPages(res.data.pagination?.pages ?? 1);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(err?.response?.data?.error || 'Could not load companies.');
        setCompanies([]);
      })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [params]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    companiesAPI.getFacets()
      .then((res) => setFacets(res.data))
      .catch(() => setFacets(null));   // the filters fall back to their defaults
  }, []);

  const set = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const activeChips = useMemo(() => {
    const chips: { key: keyof typeof EMPTY_FILTERS | 'q'; label: string }[] = [];
    if (query) chips.push({ key: 'q', label: `“${query}”` });
    if (filters.category) chips.push({ key: 'category', label: prettyCategory(filters.category) });
    if (filters.location) chips.push({ key: 'location', label: filters.location });
    if (filters.status) chips.push({ key: 'status', label: filters.status });
    if (filters.ownerId) {
      const owner = facets?.owners.find((o) => o.id === filters.ownerId);
      chips.push({ key: 'ownerId', label: owner ? owner.name : 'Owner' });
    }
    if (filters.minValuation) chips.push({ key: 'minValuation', label: `from ${formatEur(Number(filters.minValuation))}` });
    if (filters.maxValuation) chips.push({ key: 'maxValuation', label: `up to ${formatEur(Number(filters.maxValuation))}` });
    return chips;
  }, [query, filters, facets]);

  const clearChip = (key: keyof typeof EMPTY_FILTERS | 'q') => {
    if (key === 'q') { setSearch(''); setQuery(''); }
    else set(key, '');
  };

  const clearAll = () => {
    setSearch('');
    setQuery('');
    setFilters({ ...EMPTY_FILTERS });
    setSort('newest');
    setPage(1);
  };

  return (
    <ProtectedLayout>
      <div className="pj-page">
        <div className="pj-head">
          <div>
            <h1 className="pj-title">Companies</h1>
            <div className="pj-sub">
              The TBC company directory — profiles, valuations, teams and documents.
            </div>
          </div>
          {isAdmin && (
            <div className="pj-head-actions">
              <Link href="/companies/new" className="pj-btn pj-btn-primary">+ New company</Link>
            </div>
          )}
        </div>

        {/* ── Search, filters, sort, view ── */}
        <div className="pj-toolbar">
          <div className="pj-search">
            <span className="pj-search-icon" aria-hidden="true">⌕</span>
            <input
              className="pj-input"
              type="search"
              placeholder="Search by name, keyword, category, owner or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search companies"
            />
          </div>

          <div className="pj-filters">
            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-f-category">Category</label>
              <select id="cp-f-category" className="pj-select" value={filters.category}
                onChange={(e) => set('category', e.target.value)}>
                <option value="">All categories</option>
                {facets?.categories.map((c) => (
                  <option key={c.value} value={c.value}>{prettyCategory(c.value)} ({c.count})</option>
                ))}
              </select>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-f-location">Location</label>
              <select id="cp-f-location" className="pj-select" value={filters.location}
                onChange={(e) => set('location', e.target.value)}>
                <option value="">All locations</option>
                {facets?.locations.map((l) => (
                  <option key={l.value} value={l.value}>{l.value} ({l.count})</option>
                ))}
              </select>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-f-status">Status</label>
              <select id="cp-f-status" className="pj-select" value={filters.status}
                onChange={(e) => set('status', e.target.value)}>
                <option value="">{isAdmin ? 'All statuses' : 'All published'}</option>
                {(facets?.statuses || ['ACTIVE', 'INACTIVE']).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-f-owner">Owner</label>
              <select id="cp-f-owner" className="pj-select" value={filters.ownerId}
                onChange={(e) => set('ownerId', e.target.value)}>
                <option value="">All owners</option>
                {facets?.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div className="pj-field">
              <label className="pj-label">Valuation (€)</label>
              <div className="pj-range">
                <input className="pj-input" type="number" min={0} inputMode="numeric" placeholder="Min"
                  value={filters.minValuation} onChange={(e) => set('minValuation', e.target.value)}
                  aria-label="Minimum valuation in euros" />
                <span style={{ color: 'var(--text-muted)' }}>–</span>
                <input className="pj-input" type="number" min={0} inputMode="numeric" placeholder="Max"
                  value={filters.maxValuation} onChange={(e) => set('maxValuation', e.target.value)}
                  aria-label="Maximum valuation in euros" />
              </div>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-f-sort">Sort by</label>
              <select id="cp-f-sort" className="pj-select" value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="pj-toolbar-footer">
            <div className="pj-chips">
              {activeChips.length === 0 ? (
                <span className="pj-count">
                  {loading ? 'Loading…' : `${total} compan${total === 1 ? 'y' : 'ies'}`}
                </span>
              ) : (
                <>
                  {activeChips.map((chip) => (
                    <span className="pj-chip" key={chip.key}>
                      {chip.label}
                      <button type="button" aria-label={`Clear ${chip.label}`}
                        onClick={() => clearChip(chip.key)}>×</button>
                    </span>
                  ))}
                  <button type="button" className="pj-btn pj-btn-sm pj-btn-ghost" onClick={clearAll}>
                    Clear all
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {activeChips.length > 0 && (
                <span className="pj-count">
                  {loading ? 'Loading…' : `${total} match${total === 1 ? '' : 'es'}`}
                </span>
              )}
              <div className="pj-view-toggle" role="group" aria-label="View">
                <button type="button" className={`pj-view-btn${view === 'grid' ? ' active' : ''}`}
                  aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>▦ Grid</button>
                <button type="button" className={`pj-view-btn${view === 'list' ? ' active' : ''}`}
                  aria-pressed={view === 'list'} onClick={() => chooseView('list')}>☰ List</button>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="pj-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Results ── */}
        {companies.length === 0 && !loading ? (
          <div className="pj-empty">
            {activeChips.length > 0 ? 'No company matches these filters.' : 'No companies yet.'}
            {activeChips.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="pj-btn pj-btn-sm" onClick={clearAll}>Clear filters</button>
              </div>
            )}
          </div>
        ) : (
          <div className={view === 'grid' ? 'pj-grid' : 'pj-list'}
            style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s ease' }}>
            {companies.map((company) => (
              <CompanyCard key={company.id} company={company} view={view} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="pj-pager">
            <button type="button" className="pj-btn pj-btn-sm" disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Previous</button>
            <span className="pj-pager-info">Page {page} of {pages}</span>
            <button type="button" className="pj-btn pj-btn-sm" disabled={page >= pages || loading}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next ›</button>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

export default CompaniesPage;
