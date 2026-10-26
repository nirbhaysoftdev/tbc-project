'use client';
// src/components/admin/ApiKeysTab.tsx
//
// The Super Admin panel's API keys tab: credentials for machine callers of the
// event feed (new signups, withdrawal requests, enquiries).
//
// SUPER ADMIN ONLY, and structurally so — this renders inside
// /admin/super, which is wrapped in <ProtectedLayout requireAdmin
// requireSuperAdmin>, and every endpoint it calls sits behind
// requireSuperAdmin on the server. There is no "read-only for admins" mode
// here, unlike SignupNotifyTab: the list itself tells you which integrations
// can read member data, which is not an ADMIN-level fact.
//
// THE SCREEN'S ONE HARD RULE. A key is readable exactly once, in the response
// that creates or rotates it. So the newly-issued key gets its own panel at
// the top, with a copy button, and it is the only thing on the page that can
// show one — nothing re-fetches it, nothing stores it, and it is dropped from
// state the moment the admin dismisses it. If it is lost, the answer is Rotate,
// never "look it up".
//
// WHY ROTATE AND REVOKE ARE SEPARATE BUTTONS. Rotation is additive on the
// server: the replacement is issued and the old key keeps working until it is
// revoked. That is what lets a consumer deploy without a window where neither
// key is right, so the UI says so in as many words and shows `lastUsedAt` on
// the old key — which is how you know the switch has happened and the revoke
// is safe.
import React, { useCallback, useEffect, useState } from 'react';
import { apiKeysAPI, formatDateTime } from '@/lib/api';
// The project module's form classes (.pj-input, .pj-btn, .pj-badge, .pj-chip,
// .pj-callout, .pj-error, .pj-ok). All `.pj-*` scoped, so the sheet cannot
// affect the rest of the panel.
import '@/styles/projects.css';

type KeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: KeyStatus;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  rotatedFromId: string | null;
}

interface ScopeDef { scope: string; description: string }

/** The scope that decides whether a key may read personal data at all. */
const SENSITIVE = 'events:sensitive';

// Offered expiries. "Never" is in the list but is not the default: a key that
// never expires is a decision, not something you get by leaving a field alone.
const EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: '30 days',  days: 30 },
  { label: '90 days',  days: 90 },
  { label: '1 year',   days: 365 },
  { label: 'Never',    days: null },
];

const CARD: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 18,
};

const LABEL: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, display: 'block',
};

const STATUS_STYLE: Record<KeyStatus, React.CSSProperties> = {
  ACTIVE:  { background: 'rgba(46,204,113,0.14)',  color: '#5ad68c' },
  EXPIRED: { background: 'rgba(255,190,50,0.14)',   color: '#f0c04a' },
  REVOKED: { background: 'rgba(224,82,82,0.14)',    color: '#e8706f' },
};

/** Never throws, and says whether it worked - clipboard access can be denied. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [scopeCatalogue, setScopeCatalogue] = useState<ScopeDef[]>([]);
  const [defaultTtl, setDefaultTtl] = useState(365);
  const [showRevoked, setShowRevoked] = useState(false);

  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy]     = useState('');

  // The one place a key is ever on screen. `issued.replaced` is set when this
  // came from a rotation, so the panel can say the old one still works.
  const [issued, setIssued] = useState<{ key: string; row: ApiKeyRow; replaced?: ApiKeyRow } | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Create form ──
  const [creating, setCreating] = useState(false);
  const [name, setName]         = useState('');
  const [scopes, setScopes]     = useState<string[]>(['events:read']);
  const [expiryDays, setExpiryDays] = useState<number | null>(365);

  // ── Inline edit ──
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName]     = useState('');
  const [editScopes, setEditScopes] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await apiKeysAPI.list(showRevoked);
      setKeys(res.data.keys);
      setScopeCatalogue(res.data.scopes || []);
      setDefaultTtl(res.data.defaultTtlDays ?? 365);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load the API keys.');
      setKeys([]);
    }
  }, [showRevoked]);

  useEffect(() => { load(); }, [load]);

  const toggle = (list: string[], scope: string) => (
    list.includes(scope) ? list.filter((s) => s !== scope) : [...list, scope]
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setError(''); setNotice('');

    if (!name.trim()) {
      setError('Give the key a name — it is what you will revoke by.');
      return;
    }
    if (scopes.length === 0) {
      setError('Choose at least one scope. A key with no scope can reach nothing.');
      return;
    }

    setCreating(true);
    try {
      const res = await apiKeysAPI.create({
        name: name.trim(),
        scopes,
        expiresInDays: expiryDays,
      });
      setIssued({ key: res.data.key, row: res.data.apiKey });
      setCopied(false);
      setName('');
      setScopes(['events:read']);
      setExpiryDays(365);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create the key.');
    } finally {
      setCreating(false);
    }
  };

  const rotate = async (row: ApiKeyRow) => {
    if (!window.confirm(
      `Rotate “${row.name}”?\n\n`
      + 'A new key is issued with the same scopes. The current key KEEPS WORKING '
      + 'until you revoke it, so deploy the new one first, check "last used" has '
      + 'moved, then revoke the old one.',
    )) return;

    setError(''); setNotice(''); setBusy(`rotate-${row.id}`);
    try {
      const res = await apiKeysAPI.rotate(row.id);
      setIssued({ key: res.data.key, row: res.data.apiKey, replaced: res.data.replaced });
      setCopied(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not rotate the key.');
    } finally {
      setBusy('');
    }
  };

  const revoke = async (row: ApiKeyRow) => {
    // Named in the confirmation, with the consequence rather than "Are you
    // sure?" — the same idiom as the Danger zone on the accounts tab.
    if (!window.confirm(
      `Revoke “${row.name}” (${row.keyPrefix}…)?\n\n`
      + 'Anything using this key stops working on its next request. '
      + 'This cannot be undone — a replacement would be a new key.',
    )) return;

    setError(''); setNotice(''); setBusy(`revoke-${row.id}`);
    try {
      await apiKeysAPI.revoke(row.id);
      setNotice(`“${row.name}” is revoked. It stops working on its next request.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not revoke the key.');
    } finally {
      setBusy('');
    }
  };

  const startEdit = (row: ApiKeyRow) => {
    setEditing(row.id);
    setEditName(row.name);
    setEditScopes(row.scopes);
    setError(''); setNotice('');
  };

  const saveEdit = async (row: ApiKeyRow) => {
    if (editScopes.length === 0) {
      setError('A key needs at least one scope.');
      return;
    }
    setBusy(`edit-${row.id}`);
    try {
      await apiKeysAPI.update(row.id, { name: editName.trim(), scopes: editScopes });
      // Worth saying out loud: the key string does not change, so the consumer
      // needs no redeploy — the new access is live on their next request.
      setNotice(`“${editName.trim()}” updated. The same key now has: ${editScopes.join(', ')}.`);
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not update the key.');
    } finally {
      setBusy('');
    }
  };

  const describe = (scope: string) =>
    scopeCatalogue.find((s) => s.scope === scope)?.description || scope;

  const active = (keys || []).filter((k) => k.status === 'ACTIVE');
  const sensitiveCount = active.filter((k) => k.scopes.includes(SENSITIVE)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>

      {/* ── What this screen is ── */}
      <div style={CARD}>
        <span style={LABEL}>API keys</span>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 10px' }}>
          Credentials for systems outside the portal that need to read the event feed —
          new member applications, withdrawal requests and project or company enquiries.
          A key is sent as an <code>X-API-Key</code> header and can reach the feed and
          nothing else; it cannot approve, decide or change anything, and it cannot
          manage keys.
        </p>
        <div className="pj-callout">
          A key is shown <strong>once</strong>, when it is created or rotated. Only a
          digest is stored, so there is no screen anywhere that can show it again — if
          one is lost, rotate it. Every action here is recorded in Logs with your name.
        </div>
      </div>

      {error  && <div className="pj-error">{error}</div>}
      {notice && <div className="pj-ok">{notice}</div>}

      {/* ── The key, the one time it exists on screen ── */}
      {issued && (
        <div style={{ ...CARD, borderColor: 'rgba(197,164,74,0.5)' }}>
          <span style={LABEL}>
            {issued.replaced ? 'New key — shown once' : 'API key — shown once'}
          </span>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            margin: '2px 0 10px',
          }}>
            <code style={{
              flex: '1 1 320px', minWidth: 0, fontSize: 13, fontWeight: 600,
              letterSpacing: '0.02em', wordBreak: 'break-all',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 12px',
            }}>
              {issued.key}
            </code>
            <button type="button" className="pj-btn pj-btn-primary"
              onClick={async () => setCopied(await copy(issued.key))}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="pj-btn pj-btn-ghost"
              onClick={() => { setIssued(null); setCopied(false); }}>
              Done
            </button>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 10px' }}>
            <strong>{issued.row.name}</strong> · {issued.row.scopes.join(', ')} ·{' '}
            {issued.row.expiresAt ? `expires ${formatDateTime(issued.row.expiresAt)}` : 'no expiry'}
          </p>

          {issued.replaced && (
            <div className="pj-callout pj-callout-warn" style={{ marginBottom: 10 }}>
              The previous key (<strong>{issued.replaced.keyPrefix}…</strong>) is
              <strong> still working</strong>. Deploy this one, wait for “last used” on the
              old key to stop moving, then revoke it. Revoking first would be an outage.
            </div>
          )}

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Store it in the consumer’s secret store now. Send it as a header, never in a
            URL — a key in a query string is refused, because URLs end up in access logs
            and referrers:
            <pre style={{
              margin: '8px 0 0', padding: '10px 12px', overflowX: 'auto',
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 11.5, color: 'var(--text-secondary)',
            }}>
curl -H &quot;X-API-Key: {issued.key.slice(0, 16)}…&quot; \{'\n'}
{'  '}&quot;https://your-api/api/admin/events?kind=SIGNUP&quot;
            </pre>
          </div>
        </div>
      )}

      {/* ── Issue a key ── */}
      <form style={CARD} onSubmit={create}>
        <span style={LABEL}>Issue a key</span>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <input
              className="pj-input"
              value={name}
              disabled={creating}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="What is it for? e.g. Marketing site poller"
              aria-label="API key name"
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>
              One key per consumer. The name is what you will recognise and revoke by.
            </div>
          </div>

          <div style={{ flex: '0 0 150px' }}>
            <select
              className="pj-select"
              value={expiryDays === null ? 'never' : String(expiryDays)}
              disabled={creating}
              onChange={(e) => setExpiryDays(e.target.value === 'never' ? null : Number(e.target.value))}
              aria-label="Expires in"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.label} value={c.days === null ? 'never' : String(c.days)}>
                  {c.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>
              Expires in. Default {defaultTtl} days.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <span style={LABEL}>Scopes</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scopeCatalogue.map((s) => (
              <label key={s.scope} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55,
              }}>
                <input
                  type="checkbox"
                  checked={scopes.includes(s.scope)}
                  disabled={creating}
                  onChange={() => { setScopes(toggle(scopes, s.scope)); setError(''); }}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <code style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.scope}</code>
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11.5 }}>
                    {s.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {/* The decision worth slowing down for. Without this scope the feed is
              counts, statuses, amounts and a name; with it, the key can read
              passports, IBANs and members' enquiry text. */}
          {scopes.includes(SENSITIVE) && (
            <div className="pj-callout pj-callout-warn" style={{ marginTop: 12 }}>
              With <strong>{SENSITIVE}</strong> this key can read identity-document paths,
              bank account details, phone numbers, addresses and the text of members’
              enquiries. Grant it only to a system you would trust with the admin panel
              itself. Without it, the same feed is returned with all of that removed.
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="pj-btn pj-btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create key'}
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Shown once, immediately after this.
          </span>
        </div>
      </form>

      {/* ── The keys ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ ...LABEL, marginBottom: 0 }}>
            Keys{keys ? ` · ${active.length} active` : ''}
          </span>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center',
                          fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)} />
            Show revoked and expired
          </label>
        </div>

        {sensitiveCount > 0 && (
          <div className="pj-callout pj-callout-warn" style={{ margin: '10px 0 2px' }}>
            {sensitiveCount} active key{sensitiveCount === 1 ? '' : 's'} can read member
            documents and bank details. Revoke any you no longer recognise.
          </div>
        )}

        {keys === null ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 12 }}>Loading…</div>
        ) : keys.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 12, lineHeight: 1.6 }}>
            No API keys yet. Nothing outside the portal can read the event feed.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
            {keys.map((row) => {
              const dead = row.status !== 'ACTIVE';
              return (
                <div key={row.id} style={{
                  border: '1px solid var(--border)', borderRadius: 12, padding: 14,
                  background: 'rgba(255,255,255,0.015)', opacity: dead ? 0.62 : 1,
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pj-badge" style={STATUS_STYLE[row.status]}>{row.status}</span>
                    <strong style={{ fontSize: 14 }}>{row.name}</strong>
                    <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.keyPrefix}…</code>
                    {row.rotatedFromId && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        · replaced an earlier key
                      </span>
                    )}
                  </div>

                  {editing === row.id ? (
                    <div style={{ marginTop: 12 }}>
                      <input className="pj-input" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Key name" />
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 0' }}>
                        {scopeCatalogue.map((s) => (
                          <label key={s.scope} style={{ display: 'flex', gap: 7, alignItems: 'center',
                                                        fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={editScopes.includes(s.scope)}
                              onChange={() => setEditScopes(toggle(editScopes, s.scope))} />
                            <code>{s.scope}</code>
                          </label>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                        The key string does not change, so the consumer needs no redeploy —
                        this takes effect on their next request.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="pj-btn pj-btn-primary pj-btn-sm"
                          disabled={busy === `edit-${row.id}`}
                          onClick={() => saveEdit(row)}>
                          {busy === `edit-${row.id}` ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="pj-btn pj-btn-ghost pj-btn-sm"
                          onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pj-chips" style={{ margin: '10px 0 8px' }}>
                        {row.scopes.map((scope) => (
                          <span className="pj-chip" key={scope} title={describe(scope)}
                            style={scope === SENSITIVE
                              ? { borderColor: 'rgba(255,190,50,0.4)', color: '#f0c04a' }
                              : undefined}>
                            {scope}
                          </span>
                        ))}
                      </div>

                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.75 }}>
                        {/* "Last used" is the figure a revoke decision rests on. */}
                        Last used{' '}
                        {row.lastUsedAt
                          ? <>{formatDateTime(row.lastUsedAt)}{row.lastUsedIp ? ` from ${row.lastUsedIp}` : ''}</>
                          : <strong>never</strong>}
                        {' · '}
                        {row.expiresAt
                          ? <>expires {formatDateTime(row.expiresAt)}</>
                          : <>no expiry</>}
                        <br />
                        Created {formatDateTime(row.createdAt)}
                        {row.createdBy ? ` by ${row.createdBy.name}` : ' on the server (no session)'}
                        {row.revokedAt && (
                          <> · revoked {formatDateTime(row.revokedAt)}
                            {row.revokedBy ? ` by ${row.revokedBy.name}` : ''}</>
                        )}
                      </div>

                      {!dead && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          <button type="button" className="pj-btn pj-btn-ghost pj-btn-sm"
                            onClick={() => startEdit(row)}>Edit</button>
                          <button type="button" className="pj-btn pj-btn-ghost pj-btn-sm"
                            disabled={busy === `rotate-${row.id}`}
                            onClick={() => rotate(row)}>
                            {busy === `rotate-${row.id}` ? 'Rotating…' : 'Rotate'}
                          </button>
                          <button type="button" className="pj-btn pj-btn-danger pj-btn-sm"
                            disabled={busy === `revoke-${row.id}`}
                            onClick={() => revoke(row)}>
                            {busy === `revoke-${row.id}` ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
