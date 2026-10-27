'use client';
// src/components/layout/LoadMore.tsx
//
// The foot of every paged list in the panel: how much of the set is on screen,
// and the two ways to get the rest.
//
// Scroll is the primary one — the sentinel below the rows asks for the next
// page as it comes into view, 240px early so the list grows before the admin
// reaches the end. The button is not a fallback for slow connections but for
// browsers without IntersectionObserver and for a list the admin reached by
// keyboard, where nothing scrolls into view at all. Both call the same
// `onMore`, which `usePagedList` guards against overlapping requests.
import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Rows on screen. */
  shown: number;
  /** Rows matching the filter on the server. */
  total: number;
  hasMore: boolean;
  /** A later page is in flight. */
  loading: boolean;
  onMore: () => void;
}

export default function LoadMore({ shown, total, hasMore, loading, onMore }: Props) {
  const { t } = useTranslation(['common']);
  const sentinel = useRef<HTMLDivElement | null>(null);
  // The observer is rebuilt whenever the list grows, which is what makes it
  // fire again: a sentinel that stayed in view after a page loaded reports no
  // new intersection, so nothing would ask for the page after it.
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) onMoreRef.current();
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, shown]);

  // An empty list says so in its own empty row; a footer under it would be
  // "0 of 0".
  if (total === 0) return null;

  return (
    <>
      {hasMore && <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />}
      <div style={footStyle}>
        <span aria-live="polite">{t('common:pagination.shownOf', { shown, total })}</span>
        {hasMore && (
          <button
            type="button"
            onClick={onMore}
            disabled={loading}
            style={{
              padding: '6px 16px', fontSize: 12, borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: loading ? 'default' : 'pointer',
            }}>
            {loading ? t('common:pagination.loadingMore') : t('common:pagination.loadMore')}
          </button>
        )}
      </div>
    </>
  );
}

const footStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, padding: '10px 2px', fontSize: 12, color: 'var(--text-muted)',
};
