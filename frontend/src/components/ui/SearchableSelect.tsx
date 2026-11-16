'use client';
// src/components/ui/SearchableSelect.tsx
//
// A <select> you can type into. For lists that are already in memory — the
// member roster, a project list — so filtering is local and instant. (Searching
// the membership server-side is components/projects/MemberSelect.tsx.)
//
// Matches on the label and the hint (an email, say), case- and accent-
// insensitively, and every word of the query has to match, so "ali ros"
// finds "Alice Rossi".
import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text, searched too: an email, a category. */
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** What the closed control says while nothing is chosen. */
  placeholder?: string;
  searchPlaceholder?: string;
  noMatchText?: string;
  disabled?: boolean;
  id?: string;
  style?: React.CSSProperties;
  className?: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SearchableSelect({
  value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…',
  noMatchText = 'No match', disabled, id, style, className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    return options.filter((o) => {
      const hay = fold(`${o.label} ${o.hint || ''}`);
      return words.every((w) => hay.includes(w));
    });
  }, [options, query]);

  useEffect(() => { setHighlight(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    (listRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const close = () => { setOpen(false); setQuery(''); };
  const commit = (o: SelectOption) => { onChange(o.value); close(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) commit(filtered[highlight]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div className="ss-box" ref={boxRef} style={style}>
      <button
        type="button"
        id={id}
        className={`filter-select ss-trigger ${className}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? '' : 'ss-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="ss-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="ss-panel">
          <input
            ref={inputRef}
            className="filter-input ss-search"
            type="text"
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="ss-list" role="listbox" ref={listRef}>
            {filtered.map((o, i) => (
              <button
                key={o.value || `__${i}`}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`ss-item${i === highlight ? ' highlight' : ''}${o.value === value ? ' chosen' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
              >
                <span className="ss-label">{o.label}</span>
                {o.hint && <span className="ss-hint">{o.hint}</span>}
              </button>
            ))}
            {filtered.length === 0 && <div className="ss-note">{noMatchText}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
