'use client';
// src/components/admin/SuperProjectsTab.tsx
//
// Every project in the portal, with the forced delete.
//
// The ordinary delete (DELETE /projects/:id, on the project's own edit form)
// fails the moment anything references the project, because the foreign keys
// on transactions, milestones and documents are Restrict or Cascade — which is
// most real projects. The forced path in superAdminAssetsController detaches
// what can survive, cascades what cannot, and refuses outright when settled
// investments are involved. It had no UI at all, so a project with any history
// was undeletable from the portal.
//
// Nothing here deletes on one click. Selecting a project asks the server what
// a delete would destroy (the manifest) and shows it, and the project's exact
// title has to be typed — which is also what the API itself requires, so this
// is not a courtesy confirmation that a stale tab can skip.
import React, { useCallback, useEffect, useState } from 'react';
import { projectsAPI, superAdminAPI, formatEur, formatDateTime } from '@/lib/api';
import '@/styles/projects.css';

interface Row {
  id: string;
  title: string;
  status: string;
  category: string | null;
  location: string | null;
  valuationEur: number | null;
  investorCount: number;
  mediaCount: number;
  createdAt: string;
  owner: { id: string; name: string } | null;
}

interface Manifest {
  project: { id: string; title: string; status: string };
  counts: {
    detachable: Record<string, number>;
    blocking:   { investments: number; investmentRequests: number };
    cascading:  Record<string, number>;
  };
  canDelete: boolean;
  willHappen: string[];
}

const PAGE_SIZE = 25;

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  ACTIVE:    { background: 'rgba(46,204,113,0.14)', color: '#5ad68c' },
  DRAFT:     { background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' },
  COMPLETED: { background: 'rgba(58,111,255,0.14)',  color: '#7aa2ff' },
  CANCELLED: { background: 'rgba(224,82,82,0.14)',   color: '#ef8686' },
};

export default function SuperProjectsTab() {
  const [rows, setRows]       = useState<Row[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');

  // The delete dialog, in three states: nothing selected, manifest loading,
  // manifest shown.
  const [target, setTarget]     = useState<Row | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [confirm, setConfirm]   = useState('');
  const [cascade, setCascade]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [dialogErr, setDialogErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    // No `status`, which an admin's request reads as "every status" — DRAFT and
    // CANCELLED projects are exactly the ones that need clearing out.
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE), page: String(page), sort: 'newest',
    };
    if (query) params.q = query;
    projectsAPI.getAll(params)
      .then((r) => {
        setRows(r.data.projects || []);
        setTotal(r.data.pagination?.total ?? 0);
      })
      .catch(() => setError('Could not load the projects.'))
      .finally(() => setLoading(false));
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  const openDialog = async (row: Row) => {
    setTarget(row);
    setManifest(null);
    setConfirm('');
    setCascade(false);
    setDialogErr('');
    setNotice('');
    try {
      const r = await superAdminAPI.projectDeleteManifest(row.id);
      setManifest(r.data);
    } catch (err: any) {
      setDialogErr(err?.response?.data?.error || 'Could not read what this delete would affect.');
    }
  };

  const closeDialog = () => {
    if (busy) return;
    setTarget(null);
    setManifest(null);
  };

  const destroy = async () => {
    if (!target || busy) return;
    setBusy(true);
    setDialogErr('');
    try {
      const r = await superAdminAPI.forceDeleteProject(target.id, confirm, cascade);
      const d = r.data;
      setNotice(`“${target.title}” deleted. `
        + `${d.filesRemoved} media file(s) removed from disk; `
        + 'ledger rows kept with their project attribution cleared.');
      setTarget(null);
      setManifest(null);
      // Deleting the last row of a page would otherwise leave an empty table.
      if (rows.length === 1 && page > 1) setPage(page - 1); else load();
    } catch (err: any) {
      setDialogErr(err?.response?.data?.error || 'Could not delete this project.');
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const blockedByInvestments = (manifest?.counts.blocking.investments ?? 0) > 0;
  const needsCascade = (manifest?.counts.blocking.investmentRequests ?? 0) > 0;
  const titleMatches = !!manifest && confirm === manifest.project.title;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
          All projects
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
                    margin: 0, maxWidth: 680 }}>
          Every project in the portal, in every status. Deleting here uses the forced
          path: milestones and media are destroyed, ledger rows survive with their
          project attribution cleared, and a project with settled investments is
          refused until the capital has been returned.
        </p>
      </div>

      {error  && <div className="pj-error">{error}</div>}
      {notice && <div className="pj-ok">{notice}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="pj-input"
          style={{ maxWidth: 300 }}
          value={search}
          placeholder="Search title, owner, category…"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setQuery(search.trim()); } }}
          onBlur={() => { if (search.trim() !== query) { setPage(1); setQuery(search.trim()); } }}
          aria-label="Search projects"
        />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {loading ? 'Loading…' : `${total} project${total === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Valuation</th>
              <th>Investors</th>
              <th>Media</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                No projects found.
              </td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {[p.category, p.location].filter(Boolean).join(' · ') || '—'}
                    {' · '}{formatDateTime(p.createdAt)}
                  </div>
                </td>
                <td>
                  <span className="badge" style={STATUS_STYLE[p.status] || STATUS_STYLE.DRAFT}>
                    {p.status}
                  </span>
                </td>
                <td>{p.owner?.name || '—'}</td>
                <td>{p.valuationEur ? formatEur(p.valuationEur) : '—'}</td>
                <td>{p.investorCount}</td>
                <td>{p.mediaCount}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    style={{ padding: '7px 13px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                             border: '1px solid rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.1)',
                             color: 'var(--red)' }}
                    onClick={() => openDialog(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          <button className="pj-btn" disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} of {pages}</span>
          <button className="pj-btn" disabled={page >= pages || loading}
            onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {/* ── Delete dialog ── */}
      {target && (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">Delete “{target.title}”</p>

            {dialogErr && <div className="pj-error" style={{ marginBottom: 12 }}>{dialogErr}</div>}

            {!manifest && !dialogErr && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Checking what this would affect…
              </p>
            )}

            {manifest && (
              <>
                {/* The server's own account of what it will do, rather than a
                    generic warning. */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
                            margin: '0 0 12px' }}>
                  {manifest.willHappen.length === 0
                    ? 'Nothing else references this project. It will simply be removed.'
                    : 'This will:'}
                </p>
                {manifest.willHappen.length > 0 && (
                  <ul style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7,
                               margin: '0 0 14px', paddingInlineStart: 20 }}>
                    {manifest.willHappen.map((line) => (
                      <li key={line} style={line.startsWith('BLOCKED') ? { color: 'var(--red)' } : undefined}>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}

                {blockedByInvestments ? (
                  <div className="pj-error">
                    Booked capital is never destroyed here. Return the capital on
                    {' '}{manifest.counts.blocking.investments} settled investment(s) first,
                    then delete the project.
                  </div>
                ) : (
                  <>
                    {needsCascade && (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                                      fontSize: 13, color: 'var(--text-secondary)',
                                      lineHeight: 1.6, marginBottom: 14 }}>
                        <input type="checkbox" checked={cascade} disabled={busy}
                          onChange={(e) => setCascade(e.target.checked)} />
                        <span>
                          Also delete {manifest.counts.blocking.investmentRequests} pending
                          investment request(s). They are workflow records, not booked
                          capital, but the members who raised them will not be told.
                        </span>
                      </label>
                    )}

                    <label className="pj-label" htmlFor="sa-confirm-title">
                      Type the project title to confirm
                    </label>
                    <input
                      id="sa-confirm-title"
                      className="pj-input"
                      value={confirm}
                      disabled={busy}
                      autoComplete="off"
                      placeholder={manifest.project.title}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                  <button type="button" className="pj-btn" disabled={busy} onClick={closeDialog}>
                    Cancel
                  </button>
                  {!blockedByInvestments && (
                    <button
                      type="button"
                      style={{ padding: '9px 18px', fontSize: 13, borderRadius: 6,
                               border: '1px solid rgba(224,82,82,0.4)',
                               background: 'rgba(224,82,82,0.16)', color: 'var(--red)',
                               cursor: (!titleMatches || busy || (needsCascade && !cascade))
                                 ? 'default' : 'pointer',
                               opacity: (!titleMatches || busy || (needsCascade && !cascade)) ? 0.5 : 1 }}
                      disabled={!titleMatches || busy || (needsCascade && !cascade)}
                      onClick={destroy}>
                      {busy ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
