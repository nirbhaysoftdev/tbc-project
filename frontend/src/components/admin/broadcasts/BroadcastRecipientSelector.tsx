'use client';
// src/components/admin/broadcasts/BroadcastRecipientSelector.tsx
//
// Who a broadcast email is sent to. A trimmed copy of
// components/projects/RecipientSelector.tsx: same three-mode contract
// (Everyone / Everyone except… / Only…), same EXCLUDE-vs-INCLUDE asymmetry,
// same live audience - but with no project and no audience choice, because
// the broadcast composer has exactly one audience (all active members). See
// that file's header comment for the full reasoning; it is not repeated here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { broadcastsAPI } from '@/lib/api';

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
  ALL: 'Everyone (all active members)',
  EXCLUDE: 'Everyone except the members I select',
  INCLUDE: 'Only the members I select',
};

export default function BroadcastRecipientSelector({
  value, onChange, disabled,
}: {
  value: RecipientSelection;
  onChange: (next: RecipientSelection) => void;
  disabled?: boolean;
}) {
  const [members, setMembers] = useState<AudienceMember[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const loaded = useRef(false);

  const selected = useMemo(() => new Set(value.userIds), [value.userIds]);

  // Fetched once, the first time the admin picks a narrowing mode - it
  // carries member email addresses, so there is no reason to pull it for a
  // send that goes to everybody anyway.
  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    setLoading(true);
    broadcastsAPI.getAudience()
      .then((res) => {
        setMembers(res.data.members || []);
        setTotal(res.data.total ?? (res.data.members || []).length);
        setError('');
      })
      .catch((err) => {
        loaded.current = false;
        setError(err?.response?.data?.error || 'Could not load the member list.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (value.mode !== 'ALL') load();
  }, [value.mode, load]);

  const setMode = (mode: AudienceMode) => {
    // The ticks survive a switch between the two narrowing modes, but going
    // back to Everyone clears them - a stored selection that does nothing is
    // a trap for whoever reads the history.
    onChange({ mode, userIds: mode === 'ALL' ? [] : value.userIds });
  };

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

  // What the send will actually reach - a figure, not a promise, because the
  // audience is live and the server recomputes it at send time.
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
              name="bc-audience-mode"
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
              {total !== null && ` of ${total} active members`}
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
            {reach} member{reach === 1 ? '' : 's'} will be emailed
            {value.mode !== 'ALL' && total !== null && ` (of ${total})`}.{' '}
          </strong>
        )}
        Pending, frozen and rejected accounts are never included, whatever is selected here.
        Each member is emailed individually, so no address is shown to anyone else.
        {value.mode === 'INCLUDE' && ' Members approved after you press send are not added.'}
        {value.mode === 'EXCLUDE' && ' Members approved after you press send are included.'}
      </div>
    </div>
  );
}
