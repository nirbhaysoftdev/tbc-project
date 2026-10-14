'use client';
// src/components/projects/MemberSelect.tsx
//
// The searchable picker behind owner, manager, team members, investors,
// partners and clients.
//
// Two things it has to do that a plain <select> cannot:
//
//   - search the membership rather than render every member as an option;
//   - accept a name that is NOT a member. Partners and clients frequently are
//     not on the portal at all, so `allowFreeText` lets the admin type one in.
//     An entry made that way is stored with a name and no id, which is exactly
//     what backend services/projectPeople.js expects.
//
// It searches GET /projects/people/search, not the community directory: the
// directory hides PENDING and FROZEN members, and an admin assigning an owner
// needs to find them. That endpoint returns names and professional fields
// only - never an email or a phone number (backend memberVisibility.js).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { projectsAPI } from '@/lib/api';

export interface Person {
  id?: string | null;
  name: string;
  role?: string | null;
  profilePhoto?: string | null;
  profile?: { company?: string | null; jobTitle?: string | null; city?: string | null; country?: string | null } | null;
}

interface Props {
  value: Person | Person[] | null;
  onChange: (value: any) => void;
  multiple?: boolean;
  placeholder?: string;
  /** Allow a typed-in name that does not match a member. */
  allowFreeText?: boolean;
  id?: string;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

/** "Acme · Milan" — whatever professional context the picker actually has. */
const subtitle = (p: Person) =>
  [p.profile?.jobTitle, p.profile?.company, p.profile?.city || p.profile?.country]
    .filter(Boolean)
    .join(' · ');

export function PersonAvatar({ person, large }: { person: Person; large?: boolean }) {
  return (
    <span className={`pj-avatar${large ? ' pj-avatar-lg' : ''}`} aria-hidden="true">
      {person.profilePhoto
        ? <img src={person.profilePhoto} alt="" />
        : initials(person.name || '?')}
    </span>
  );
}

export default function MemberSelect({
  value, onChange, multiple = false, placeholder = 'Search members…', allowFreeText = false, id,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const selected: Person[] = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value : [];
    return value && !Array.isArray(value) ? [value] : [];
  }, [value, multiple]);

  // Debounced search. The cleanup also covers the unmount case, so a result
  // cannot arrive after the picker has closed and overwrite nothing.
  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); setLoading(false); return; }

    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      projectsAPI.searchPeople(term, 10)
        .then((r) => { if (!cancelled) { setResults(r.data.members || []); setHighlight(0); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 280);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Close on an outside click, like the other dropdowns in the portal.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (person: Person) => {
    if (multiple) {
      const already = selected.some((s) =>
        (person.id && s.id === person.id) || (!person.id && s.name === person.name));
      if (!already) onChange([...selected, person]);
    } else {
      onChange(person);
    }
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const remove = (person: Person) => {
    if (!multiple) { onChange(null); return; }
    onChange(selected.filter((s) => (person.id ? s.id !== person.id : s.name !== person.name)));
  };

  const addFreeText = () => {
    const name = query.trim();
    if (!name) return;
    commit({ id: null, name });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlight]) commit(results[highlight]);
      else if (allowFreeText) addFreeText();
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && selected.length > 0 && multiple) {
      // Backspace on an empty field removes the last token, as in every other
      // tag input.
      remove(selected[selected.length - 1]);
    }
  };

  // In single-select mode the chosen person replaces the search field, so it is
  // obvious that picking again means removing first.
  const showInput = multiple || selected.length === 0;

  return (
    <div className="pj-picker" ref={boxRef}>
      {showInput && (
        <input
          id={id}
          className="pj-input"
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      )}

      {open && showInput && (query.trim() || loading) && (
        <div className="pj-picker-results" role="listbox">
          {loading && <div className="pj-picker-note">Searching…</div>}

          {!loading && results.map((person, i) => (
            <button
              key={person.id || person.name}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`pj-picker-item${i === highlight ? ' highlight' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(person)}
            >
              <PersonAvatar person={person} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13 }}>{person.name}</span>
                {subtitle(person) && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                    {subtitle(person)}
                  </span>
                )}
              </span>
            </button>
          ))}

          {!loading && results.length === 0 && !allowFreeText && (
            <div className="pj-picker-note">No member matches “{query.trim()}”.</div>
          )}

          {!loading && allowFreeText && query.trim() && (
            <button type="button" className="pj-picker-item" onClick={addFreeText}>
              <span className="pj-avatar" aria-hidden="true">+</span>
              <span>
                <span style={{ display: 'block', fontSize: 13 }}>Add “{query.trim()}”</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                  Not a portal member — stored as a name only
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="pj-picker-selected">
          {selected.map((person) => (
            <span className="pj-token" key={person.id || person.name}>
              <PersonAvatar person={person} />
              <span>{person.name}</span>
              <button type="button" aria-label={`Remove ${person.name}`} onClick={() => remove(person)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
