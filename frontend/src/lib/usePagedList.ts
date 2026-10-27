'use client';
// src/lib/usePagedList.ts
//
// One paged list, accumulated. Every admin list endpoint already pages and
// already returns `pagination.total`; the panel used to render only whatever
// the first response happened to contain (20 members, 25 enquiries) with
// nothing on screen saying there was more, so a portal with 40 members showed
// 20 and looked complete.
//
// The hook keeps the pages it has fetched and appends the next one, which is
// what both the "Load more" button and the on-scroll sentinel in
// `components/common/LoadMore.tsx` drive. `total` is the figure from the API,
// not the length of what has loaded, so the count beside a list is the size of
// the whole filtered set.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResult<T> {
  items: T[];
  total: number;
}

export interface PagedList<T> {
  /** Every row fetched so far, in server order. */
  items: T[];
  /** Rows matching the filter on the server, not `items.length`. */
  total: number;
  /** The first page is in flight: the list is empty or being replaced. */
  loading: boolean;
  /** A later page is in flight: what is on screen stays on screen. */
  loadingMore: boolean;
  hasMore: boolean;
  failed: boolean;
  loadMore: () => void;
  /** Re-fetch from page 1. Used after an action changes a row. */
  reload: () => void;
}

export function usePagedList<T>(opts: {
  /**
   * Changing this resets the list to page 1 — it is the filter, debounced by
   * the caller if it comes from a text input.
   */
  key?: string;
  limit?: number;
  load: (params: { page: number; limit: number }) => Promise<PagedResult<T>>;
}): PagedList<T> {
  const { key = '', limit = 25, load } = opts;

  // `load` is an inline closure over the caller's current filters, so it is a
  // new function every render and cannot be an effect dependency. The ref
  // keeps the latest one without re-fetching.
  const loadRef = useRef(load);
  loadRef.current = load;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [token, setToken] = useState(0);

  // Each fetch carries the id of the run that started it and a stale result is
  // dropped rather than appended, so a fast retype cannot interleave two
  // searches into one list.
  const runRef = useRef(0);

  const fetchPage = useCallback((next: number) => {
    const run = ++runRef.current;
    if (next === 1) setLoading(true); else setLoadingMore(true);
    setFailed(false);
    loadRef.current({ page: next, limit })
      .then(res => {
        if (run !== runRef.current) return;
        setItems(prev => (next === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(next);
      })
      .catch(() => {
        if (run !== runRef.current) return;
        setFailed(true);
        if (next === 1) { setItems([]); setTotal(0); setPage(0); }
      })
      .finally(() => {
        if (run !== runRef.current) return;
        setLoading(false);
        setLoadingMore(false);
      });
  }, [limit]);

  useEffect(() => { fetchPage(1); }, [key, token, fetchPage]);

  // A page that comes back short ends the list even if `total` disagrees,
  // which it can when rows are created while the admin is paging.
  const hasMore = items.length > 0 && items.length < total;

  return {
    items, total, loading, loadingMore, hasMore, failed,
    loadMore: () => { if (!loading && !loadingMore && hasMore) fetchPage(page + 1); },
    reload: () => setToken(t => t + 1),
  };
}
