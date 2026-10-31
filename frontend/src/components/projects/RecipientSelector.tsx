'use client';
// src/components/projects/RecipientSelector.tsx
//
// Who an announcement is sent to. Used by both actions that send one — the
// launch confirmation and the major-update composer — because "which members
// hear about this?" is the same question in both places and a second copy of
// the answer would drift from the first.
//
// THREE MODES, AND THE DEFAULT IS EVERYONE. Narrowing a send is the exception,
// so the picker opens closed: the list is not even fetched until the admin
// asks to choose, and leaving the dialog alone mails the whole audience, which
// is what it did before this existed.
//
//   Everyone              the audience as the server computes it
//   Everyone except…      the audience minus the ticked members
//   Only…                 the ticked members and nobody else
//
// EXCLUDE AND INCLUDE ARE NOT THE SAME SEND WITH THE TICKS INVERTED. The
// audience is live: a member approved between opening this and pressing send
// is in it. An EXCLUDE send reaches them, because they are not one of the
// people deliberately left off; an INCLUDE send does not, because nobody
// chose them. Which is the right way round, and why the mode is stored rather
// than resolved to a list of ids here.
//
// What it CANNOT narrow is the community feed post. Who may see a project is
// decided by the project's status, not by who was told about it, so the post
// goes to the feed either way — said plainly below rather than left for an
// admin to discover.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectsAPI } from '@/lib/api';

export type AudienceMode = 'ALL' | 'INCLUDE' | 'EXCLUDE';

export interface AudienceMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface RecipientSelection {
  mode: AudienceMode;
  userIds: string[];
}

const MODE_LABEL: Record<AudienceMode, string> = {
  ALL: 'Everyone in this audience',
  EXCLUDE: 'Everyone except the members I select',
  INCLUDE: 'Only the members I select',
};

export default function RecipientSelector({
  projectId, audience, value, onChange, disabled,
}: {
  projectId: string;
  /** The audience the server will start from, e.g. ALL_ACTIVE_MEMBERS. */
  audience: string;
  value: RecipientSelection;
  onChange: (next: RecipientSelection) => void;
  disabled?: boolean;
}) {
  const [members, setMembers] = useState<AudienceMember[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const loadedFor = useRef<string | null>(null);

  const selected = useMemo(() => new Set(value.userIds), [value.userIds]);

  // The list is fetched once the admin picks a narrowing mode, and once per
  // audience. It carries member email addresses, so there is no reason to pull
  // it for a send that goes to everybody anyway.
  const load = useCallback(() => {
    if (loadedFor.current === audience) return;
    loadedFor.current = audience;
    setLoading(true);
    projectsAPI.getAnnouncementAudience(projectId, audience)
      .then((res) => {
        setMembers(res.data.members || []);
        setTotal(res.data.total ?? (res.data.members || []).length);
        setError('');
      })
      .catch((err) => {
        loadedFor.current = null;
        setError(err?.response?.data?.error || 'Could not load the member list.');
      })
      .finally(() => setLoading(false));
  }, [projectId, audience]);

  useEffect(() => {
    if (value.mode !== 'ALL') load();
  }, [value.mode, load]);

  // Switching audience invalidates a selection made against the old one:
  // ids that are no longer in the audience would read as exclusions of people
  // who were never going to be mailed.
  useEffect(() => {
    loadedFor.current = null;
    setMembers(null);
    setTotal(null);
    onChange({ mode: 'ALL', userIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  const setMode = (mode: AudienceMode) => {
    // The ticks survive a switch between the two narrowing modes — an admin
    // who ticked the wrong way round should not have to tick again — but
    // going back to Everyone clears them, because a stored selection that
    // does nothing is a trap for whoever reads the history.
    onChange({ mode, userIds: mode === 'ALL' ? [] : value.userIds });
  };

  // Arrays rather than spreading a Set: the build targets ES5, where
  // iterating a Set needs downlevelIteration.
  const toggle = (id: string) => {
    const next = selected.has(id)
      ? value.userIds.filter((other) => other !== id)
      : value.userIds.concat(id);
    onChange({ mode: value.mode, userIds: next });
  };

  const visible = useMemo(() => {
    if (!members) return [];
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q)
      || m.email.toLowerCase().includes(q));
  }, [members, query]);

  const allVisibleTicked = visible.length > 0 && visible.every((m) => selected.has(m.id));

  const toggleVisible = () => {
    const shown = new Set(visible.map((m) => m.id));
    const next = allVisibleTicked
      ? value.userIds.filter((id) => !shown.has(id))
      : value.userIds.concat(visible.filter((m) => !selected.has(m.id)).map((m) => m.id));
    onChange({ mode: value.mode, userIds: next });
  };

  // What the send will actually reach. A figure and not a promise: the
  // audience is live, so the server recomputes it, and this is the count as
  // the list stands now.
  const reach = (() => {
    if (total === null) return null;
    if (value.mode === 'ALL') return total;
    if (value.mode === 'INCLUDE') return value.userIds.length;
    return Math.max(total - value.userIds.length, 0);
  })();

  return (
    <div className="pj-field pj-recipients">
      <div className="pj-label">Who receives this</div>

      <div className="pj-mode-group" role="radiogroup" aria-label="Who receives this">
        {(['ALL', 'EXCLUDE', 'INCLUDE'] as AudienceMode[]).map((mode) => (
          <label key={mode} className={`pj-mode${value.mode === mode ? ' pj-mode-on' : ''}`}>
            <input
              type="radio"
              name="pj-audience-mode"
              checked={value.mode === mode}
              disabled={disabled}
              onChange={() => setMode(mode)}
            />
            <span>{MODE_LABEL[mode]}</span>
          </label>
        ))}
      </div>

      {value.mode !== 'ALL' && (
        <div className="pj-picker">
          <div className="pj-picker-head">
            <input
              className="pj-input pj-picker-search"
              placeholder="Search members by name or email"
              value={query}
              disabled={disabled}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="pj-btn pj-btn-sm" onClick={toggleVisible}
              disabled={disabled || visible.length === 0}>
              {allVisibleTicked ? 'Untick these' : `Tick these ${visible.length || ''}`.trim()}
            </button>
          </div>

          {loading && <div className="pj-hint">Loading members…</div>}
          {error && <div className="pj-error">{error}</div>}

          {members && !loading && (
            visible.length === 0 ? (
              <div className="pj-hint">No member matches “{query}”.</div>
            ) : (
              <div className="pj-picker-list">
                {visible.map((m) => {
                  const ticked = selected.has(m.id);
                  // The tick means the opposite thing in the two modes, so it
                  // says which: a list of silent checkboxes is how somebody
                  // mails the one person they meant to leave out.
                  return (
                    <label key={m.id} className={`pj-picker-row${ticked ? ' pj-picker-on' : ''}`}>
                      <input type="checkbox" checked={ticked} disabled={disabled}
                        onChange={() => toggle(m.id)} />
                      <span className="pj-picker-name">
                        {m.name}
                        {m.role !== 'MEMBER' && <span className="pj-picker-role">{m.role}</span>}
                      </span>
                      <span className="pj-picker-email">{m.email}</span>
                      <span className="pj-picker-state">
                        {ticked
                          ? (value.mode === 'INCLUDE' ? 'will receive' : 'excluded')
                          : (value.mode === 'INCLUDE' ? '—' : 'will receive')}
                      </span>
                    </label>
                  );
                })}
              </div>
            )
          )}

          <div className="pj-picker-foot">
            <span>
              {value.userIds.length} selected
              {total !== null && ` of ${total} in the audience`}
            </span>
            {value.userIds.length > 0 && (
              <button type="button" className="pj-btn-link" disabled={disabled}
                onClick={() => onChange({ mode: value.mode, userIds: [] })}>
                Clear selection
              </button>
            )}
          </div>
        </div>
      )}

      <div className="pj-hint">
        {reach !== null && (
          <strong>
            {reach} member{reach === 1 ? '' : 's'} will be emailed and notified
            {value.mode !== 'ALL' && total !== null && ` (of ${total})`}.{' '}
          </strong>
        )}
        Pending, frozen and rejected accounts are never included, whatever is selected here.
        Each member is emailed individually, so no address is shown to anyone else.
        {value.mode === 'INCLUDE' && ' Members approved after you press send are not added.'}
        {value.mode === 'EXCLUDE' && ' Members approved after you press send are included.'}
        {' '}The community feed post is published either way — this chooses who is emailed and
        notified, not who may open the project.
      </div>
    </div>
  );
}
