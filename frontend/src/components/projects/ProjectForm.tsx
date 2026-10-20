'use client';
// src/components/projects/ProjectForm.tsx
//
// The admin create/edit form. One component serves both: `initial` decides
// whether it POSTs a new project or PUTs an existing one, so the two can never
// drift apart in which fields they offer.
//
// Files behave differently in the two modes, and that is deliberate:
//   - creating, there is no project id to upload against yet, so the chosen
//     files are held locally with previews and uploaded immediately after the
//     project is created;
//   - editing, the project exists, so files upload straight away and the
//     already-attached ones are managed in place.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MemberSelect, { Person } from './MemberSelect';
import RichTextEditor from './RichTextEditor';
import ProjectDocuments from './ProjectDocuments';
import { projectsAPI, mediaSrc } from '@/lib/api';
import { checkFileSizes, documentLimitHint } from '@/lib/uploadLimits';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';

const CATEGORIES = [
  'REAL_ESTATE', 'ENERGY', 'TECHNOLOGY', 'MANUFACTURING', 'HOSPITALITY',
  'HEALTHCARE', 'LOGISTICS', 'AGRICULTURE', 'FINANCE', 'RETAIL',
  'CONSTRUCTION', 'EDUCATION', 'MEDIA', 'OTHER',
];

const STATUSES = ['DRAFT', 'ACTIVE', 'FUNDED', 'CLOSED', 'CANCELLED'];

const pretty = (value: string) =>
  value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime';

/** A file waiting to be uploaded, with its preview URL when it is an image. */
interface Pending {
  file: File;
  preview: string | null;
}

const asDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export default function ProjectForm({
  initial, onSaved,
}: {
  initial?: any;
  onSaved?: (project: any) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const editing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [status, setStatus] = useState(initial?.status || 'ACTIVE');
  const [description, setDescription] = useState(initial?.description || '');
  const [detailsHtml, setDetailsHtml] = useState(initial?.detailsHtml || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [valuation, setValuation] = useState(
    initial?.valuation ?? initial?.valuationEur ?? initial?.targetAmount ?? '',
  );
  const [establishedAt, setEstablishedAt] = useState(asDateInput(initial?.establishedAt));
  const [primaryObjective, setPrimaryObjective] = useState(initial?.primaryObjective || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [contact, setContact] = useState(initial?.contact || '');

  const [owner, setOwner]     = useState<Person | null>(initial?.owner || null);
  const [manager, setManager] = useState<Person | null>(initial?.manager || null);
  const [teamMembers, setTeamMembers] = useState<Person[]>(initial?.teamMembers || []);
  const [investors, setInvestors]     = useState<Person[]>(initial?.investors || []);
  const [partners, setPartners]       = useState<Person[]>(initial?.partners || []);
  const [clients, setClients]         = useState<Person[]>(initial?.clients || []);

  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Object URLs for the image previews are revoked on unmount; without this
  // every file the admin picks and removes leaks a blob for the session.
  useEffect(() => () => {
    pending.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;

    // Rejected at selection, before anything is queued: queueing a file that
    // the server will refuse means the project saves and the upload then
    // fails, which is a confusing half-success.
    const tooLarge = checkFileSizes(files);
    if (tooLarge) { setError(tooLarge); return; }
    setError('');

    const added = Array.from(files).map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setPending((prev) => [...prev, ...added]);
  };

  const removePending = (index: number) => {
    setPending((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadPending = async (projectId: string) => {
    if (pending.length === 0) return;
    const form = new FormData();
    pending.forEach((p) => form.append('files', p.file));
    await projectsAPI.uploadMedia(projectId, form);
    pending.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    setPending([]);
  };

  /**
   * Insert an image into the rich-text body.
   *
   * Only offered once the project exists: the image has to be uploaded to a
   * project to get a viewable URL, and an image pasted as a `data:` URI into
   * the body would put megabytes of base64 into the `detailsHtml` column.
   */
  const insertBodyImage = editing
    ? async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
        return new Promise<string | null>((resolve) => {
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            try {
              const form = new FormData();
              form.append('files', file);
              const res = await projectsAPI.uploadMedia(initial.id, form);
              const created = res.data.media?.[0];
              resolve(created ? mediaSrc(created.streamUrl) : null);
            } catch {
              setError('That image could not be uploaded.');
              resolve(null);
            }
          };
          input.click();
        });
      }
    : undefined;

  const payload = useMemo(() => ({
    title,
    category,
    status,
    description,
    detailsHtml,
    location,
    valuation,
    establishedAt: establishedAt || null,
    primaryObjective,
    url,
    contact,
    ownerId: owner?.id || null,
    managerId: manager?.id || null,
    // People go as objects, not ids: a partner or client may be a typed-in
    // name with no account behind it. The server normalises and re-resolves
    // the member entries (backend services/projectPeople.js).
    teamMembers,
    investors,
    partners,
    clients,
  }), [title, category, status, description, detailsHtml, location, valuation,
       establishedAt, primaryObjective, url, contact, owner, manager,
       teamMembers, investors, partners, clients]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!title.trim())    { setError('A project name is required.'); return; }
    if (!category)        { setError('Choose a category.'); return; }
    if (valuation === '' || Number.isNaN(Number(valuation)) || Number(valuation) < 0) {
      setError('Enter the valuation in euros.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await projectsAPI.update(initial.id, payload);
        await uploadPending(initial.id);
        setNotice('Saved.');
        onSaved?.(res.data.project);
      } else {
        const res = await projectsAPI.create(payload);
        const created = res.data.project;
        // The project is saved before the files go up. If an upload fails the
        // project still exists and the admin can retry from the edit page,
        // rather than losing everything they typed.
        try {
          await uploadPending(created.id);
        } catch {
          setError('The project was created, but some files did not upload. Open it to try again.');
        }
        onSaved?.(created);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save this project.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete “${initial.title}”? This also deletes its documents and cannot be undone.`)) return;
    setSaving(true);
    try {
      await projectsAPI.remove(initial.id);
      router.push('/projects');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not delete this project.');
      setSaving(false);
    }
  };

  return (
    <form className="pj-form" onSubmit={submit}>
      {error && <div className="pj-error">{error}</div>}
      {notice && <div className="pj-ok">{notice}</div>}

      {/* ── Identity ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Project</div>

        <div className="pj-field" style={{ marginBottom: 14 }}>
          <label className="pj-label" htmlFor="pj-title">Project name *</label>
          <input id="pj-title" className="pj-input" value={title} required
            onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Porto Vecchio Marina Redevelopment" />
        </div>

        <div className="pj-form-grid">
          <div className="pj-field">
            <label className="pj-label" htmlFor="pj-category">Category *</label>
            <select id="pj-category" className="pj-select" value={category} required
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
              {/* A project created before this list keeps its own category. */}
              {category && !CATEGORIES.includes(category) && (
                <option value={category}>{pretty(category)}</option>
              )}
            </select>
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="pj-location">Location</label>
            <input id="pj-location" className="pj-input" value={location}
              onChange={(e) => setLocation(e.target.value)} placeholder="City, country" />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="pj-valuation">Valuation (€) *</label>
            <input id="pj-valuation" className="pj-input" type="number" min={0} step="any" required
              inputMode="decimal" value={valuation}
              onChange={(e) => setValuation(e.target.value)} placeholder="4000000" />
            <span className="pj-hint">Euros only — every figure in the portal is €.</span>
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="pj-established">Establishment date</label>
            <input id="pj-established" className="pj-input" type="date" value={establishedAt}
              onChange={(e) => setEstablishedAt(e.target.value)} />
          </div>

          <div className="pj-field">
            <label className="pj-label" htmlFor="pj-status">Status</label>
            <select id="pj-status" className="pj-select" value={status}
              onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
            </select>
            <span className="pj-hint">A draft is visible to admins only.</span>
          </div>
        </div>

        <div className="pj-field" style={{ marginTop: 14 }}>
          <label className="pj-label" htmlFor="pj-objective">Primary objective</label>
          <input id="pj-objective" className="pj-input" value={primaryObjective}
            onChange={(e) => setPrimaryObjective(e.target.value)}
            placeholder="What this project sets out to achieve" />
        </div>

        <div className="pj-field" style={{ marginTop: 14 }}>
          <label className="pj-label" htmlFor="pj-description">Short description</label>
          <textarea id="pj-description" className="pj-textarea" value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One or two sentences — this is what appears on the project card." />
          <span className="pj-hint">
            Left empty, this is taken from the opening of the detailed description below.
          </span>
        </div>
      </div>

      {/* ── Rich text ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Project details</div>
        <RichTextEditor
          value={initial?.detailsHtml || ''}
          documentKey={initial?.id || 'new'}
          onChange={setDetailsHtml}
          onRequestImage={insertBodyImage}
          placeholder="The full description: headings, lists, tables, links and images…"
        />
        <span className="pj-hint" style={{ display: 'block', marginTop: 8 }}>
          {editing
            ? 'Images inserted here are uploaded to this project and served through the portal’s authorised viewer.'
            : 'Save the project first to be able to insert uploaded images into this description.'}
        </span>
      </div>

      {/* ── People ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">People</div>
        <div className="pj-form-row">
          <div className="pj-field">
            <label className="pj-label">Project owner</label>
            <MemberSelect value={owner} onChange={setOwner} placeholder="Search members…" />
            <span className="pj-hint">Defaults to you if left empty.</span>
          </div>
          <div className="pj-field">
            <label className="pj-label">Project manager</label>
            <MemberSelect value={manager} onChange={setManager} placeholder="Search members…" />
          </div>
        </div>

        <div className="pj-form-row" style={{ marginTop: 14 }}>
          <div className="pj-field">
            <label className="pj-label">Team members</label>
            <MemberSelect multiple allowFreeText value={teamMembers} onChange={setTeamMembers}
              placeholder="Add a team member…" />
          </div>
          <div className="pj-field">
            <label className="pj-label">Investors</label>
            <MemberSelect multiple allowFreeText value={investors} onChange={setInvestors}
              placeholder="Add an investor…" />
          </div>
        </div>

        <div className="pj-form-row" style={{ marginTop: 14 }}>
          <div className="pj-field">
            <label className="pj-label">Partners</label>
            <MemberSelect multiple allowFreeText value={partners} onChange={setPartners}
              placeholder="Add a partner…" />
          </div>
          <div className="pj-field">
            <label className="pj-label">Clients</label>
            <MemberSelect multiple allowFreeText value={clients} onChange={setClients}
              placeholder="Add a client…" />
          </div>
        </div>

        <span className="pj-hint" style={{ display: 'block', marginTop: 12 }}>
          Team, investors, partners and clients accept people who are not portal members —
          type a name and choose “Add”.
        </span>
      </div>

      {/* ── Contact & enquiries ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Contact &amp; enquiries</div>

        <div className="pj-field">
          <label className="pj-label" htmlFor="pj-url">Project URL</label>
          <input id="pj-url" className="pj-input" value={url} inputMode="url"
            onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          <span className="pj-hint">Shown on the project page.</span>
        </div>

        <div className="pj-hint" style={{ marginTop: 14 }}>
          “Enquire Now” messages go to the portal&rsquo;s enquiry recipient, set once for
          every project and company in <strong>Admin Panel → Enquiries</strong>.
        </div>

        <div className="pj-field" style={{ marginTop: 14 }}>
          <label className="pj-label" htmlFor="pj-contact">Internal contact notes</label>
          <textarea id="pj-contact" className="pj-textarea" value={contact}
            style={{ minHeight: 70 }}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Name, email, phone…" />
          <span className="pj-hint">
            Administration only — this is no longer displayed on the project page. Members
            reach the team through “Enquire Now”.
          </span>
        </div>
      </div>

      {/* ── Files ── */}
      <div className="pj-panel">
        <div className="pj-panel-title">Images &amp; documents</div>

        <div
          className={`pj-drop${dragOver ? ' over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        >
          <div className="pj-drop-title">Choose images, PDFs or video</div>
          <div className="pj-drop-sub">
            Drag files here or click to browse. Several at once is fine — PDFs {documentLimitHint}.
            {editing ? '' : ' They upload as soon as the project is created.'}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />

        {pending.length > 0 && (
          <div className="pj-previews">
            {pending.map((item, i) => (
              <div className="pj-preview" key={`${item.file.name}-${i}`}>
                <div className="pj-preview-thumb">
                  {item.preview
                    ? <img src={item.preview} alt="" />
                    : <span className="pj-media-kind">
                        {item.file.type === 'application/pdf' ? 'PDF' : 'FILE'}
                      </span>}
                </div>
                <div className="pj-preview-name" title={item.file.name}>{item.file.name}</div>
                <button type="button" className="pj-preview-remove" aria-label={`Remove ${item.file.name}`}
                  onClick={(e) => { e.stopPropagation(); removePending(i); }}>×</button>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div style={{ marginTop: 18 }}>
            <span className="pj-label" style={{ display: 'block', marginBottom: 10 }}>
              Already attached
            </span>
            <ProjectDocuments
              projectId={initial.id}
              canManage
              bannerDocId={initial.bannerDocId}
              onSetBanner={async (docId) => {
                try { await projectsAPI.update(initial.id, { bannerDocId: docId }); setNotice('Banner updated.'); }
                catch { setError('Could not set that image as the banner.'); }
              }}
            />
          </div>
        )}
      </div>

      <div className="pj-form-actions">
        {/* Deleting a project is irreversible and touches the investment
            ledger, so an admin can create and edit one but not remove it. A
            super admin deletes from Admin → Super Admin, which shows what
            would be destroyed before it happens. */}
        {editing && isSuperAdminRole(user?.role) && (
          <button type="button" className="pj-btn pj-btn-danger" onClick={remove} disabled={saving}>
            Delete project
          </button>
        )}
        <button type="button" className="pj-btn pj-btn-ghost" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="pj-btn pj-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
