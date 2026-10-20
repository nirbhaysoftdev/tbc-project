'use client';
// src/components/companies/CompanyForm.tsx
//
// The admin create/edit form for a company profile. One component serves both,
// so the two can never drift apart in which fields they offer.
//
// Files behave differently in the two modes, deliberately:
//   - creating, there is no company id to upload against, so files are held
//     locally with previews, grouped by what they are for, and uploaded
//     immediately after the profile is created;
//   - editing, the company exists, so uploads go straight up and the already
//     attached media is managed in place through CompanyMedia.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MemberSelect, { Person } from '@/components/projects/MemberSelect';
import RichTextEditor from '@/components/projects/RichTextEditor';
import CompanyMedia, { VideoLink } from './CompanyMedia';
import TagInput from './TagInput';
import { companiesAPI, mediaSrc, formatEur } from '@/lib/api';
import { checkFileSizes, documentLimitHint, imageLimitHint } from '@/lib/uploadLimits';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';

const CATEGORIES = [
  'REAL_ESTATE', 'ENERGY', 'TECHNOLOGY', 'MANUFACTURING', 'HOSPITALITY',
  'HEALTHCARE', 'LOGISTICS', 'AGRICULTURE', 'FINANCE', 'RETAIL',
  'CONSTRUCTION', 'EDUCATION', 'MEDIA', 'CONSULTING', 'TRADE', 'OTHER',
];

const STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

const pretty = (value: string) =>
  value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
const ACCEPT_DOC = 'application/pdf,application/msword,'
  + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ACCEPT_VIDEO = 'video/mp4,video/webm,video/quicktime';

// Only these two providers are accepted server-side, so the form checks the
// same thing rather than letting a link be silently dropped on save.
const VIDEO_LINK_RE = /(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/|vimeo\.com\/)/i;

/** A file waiting to be uploaded, with its preview URL when it is an image. */
interface Pending { file: File; preview: string | null; purpose: string }

const asDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';


export default function CompanyForm({
  initial, onSaved,
}: {
  initial?: any;
  onSaved?: (company: any) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const editing = Boolean(initial?.id);

  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [status, setStatus] = useState(initial?.status || 'ACTIVE');
  const [description, setDescription] = useState(initial?.description || '');
  const [detailsHtml, setDetailsHtml] = useState(initial?.detailsHtml || '');
  const [valuation, setValuation] = useState(
    initial?.valuation === null || initial?.valuation === undefined ? '' : String(initial.valuation),
  );
  const [establishedAt, setEstablishedAt] = useState(asDateInput(initial?.establishedAt));
  const [locations, setLocations] = useState<string[]>(initial?.locations || []);

  const [owners, setOwners] = useState<Person[]>(initial?.owners || []);
  const [teamMembers, setTeamMembers] = useState<Person[]>(initial?.teamMembers || []);

  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl || '');
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson || '');
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone || '');

  const [videoLinks, setVideoLinks] = useState<VideoLink[]>(initial?.videoLinks || []);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);

  const galleryRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);

  // Object URLs for the previews are revoked on unmount; without this every
  // file picked and removed leaks a blob for the rest of the session.
  useEffect(() => () => {
    pending.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList | File[] | null, purpose: string, single = false) => {
    if (!files) return;

    // Rejected at selection, before anything is queued: a queued file the
    // server will refuse means the profile saves and the upload then fails,
    // which is a confusing half-success.
    const tooLarge = checkFileSizes(files);
    if (tooLarge) { setError(tooLarge); return; }
    setError('');

    const chosen = single ? Array.from(files).slice(0, 1) : Array.from(files);
    const added = chosen.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      purpose,
    }));

    setPending((prev) => {
      if (!single) return [...prev, ...added];
      // A logo or a banner is one file: picking a second replaces the first,
      // and the preview it was using is revoked rather than left dangling.
      prev.filter((p) => p.purpose === purpose && p.preview)
        .forEach((p) => URL.revokeObjectURL(p.preview as string));
      return [...prev.filter((p) => p.purpose !== purpose), ...added];
    });
  };

  const removePending = (target: Pending) => {
    if (target.preview) URL.revokeObjectURL(target.preview);
    setPending((prev) => prev.filter((p) => p !== target));
  };

  const pendingOf = (purpose: string) => pending.filter((p) => p.purpose === purpose);

  /**
   * Upload the queued files, one request per purpose.
   *
   * Grouped rather than sent as one batch because the server uses `purpose` to
   * place the files — and to point the profile at a new logo or banner — so a
   * mixed batch would have to pick one label for all of them.
   */
  const uploadPending = async (companyId: string) => {
    // Array.from rather than spreading the Set: tsconfig targets ES5, where
    // spreading an iterable is a compile error.
    const purposes = Array.from(new Set(pending.map((p) => p.purpose)));
    for (const purpose of purposes) {
      const group = pendingOf(purpose);
      if (group.length === 0) continue;
      const form = new FormData();
      group.forEach((p) => form.append('files', p.file));
      form.append('purpose', purpose);
      await companiesAPI.uploadMedia(companyId, form);
    }
    pending.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
    setPending([]);
  };

  const addVideoLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    if (!VIDEO_LINK_RE.test(url)) {
      setError('Presentation links must be a YouTube or Vimeo URL.');
      return;
    }
    if (videoLinks.some((v) => v.url === url)) { setLinkDraft(''); return; }
    setError('');
    setVideoLinks([...videoLinks, { url, title: linkTitle.trim() || 'Presentation' }]);
    setLinkDraft('');
    setLinkTitle('');
  };

  /** Insert an image into the rich-text body. Only once the company exists. */
  const insertBodyImage = editing
    ? async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ACCEPT_IMAGE;
        return new Promise<string | null>((resolve) => {
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            try {
              const form = new FormData();
              form.append('files', file);
              form.append('purpose', 'GALLERY');
              const res = await companiesAPI.uploadMedia(initial.id, form);
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
    name,
    category,
    status,
    description,
    detailsHtml,
    valuation: valuation === '' ? null : valuation,
    establishedAt: establishedAt || null,
    locations,
    // People go as objects, not ids: an owner or team member may be a typed-in
    // name with no account behind it. The server normalises them and keeps the
    // member ids beside the list for the owner filter.
    owners,
    teamMembers,
    websiteUrl,
    contactPerson,
    contactEmail,
    contactPhone,
    videoLinks,
  }), [name, category, status, description, detailsHtml, valuation, establishedAt,
       locations, owners, teamMembers, websiteUrl, contactPerson, contactEmail,
       contactPhone, videoLinks]);

  /** Everything the Save button checks. Returns the first problem, or null. */
  const validate = (): string | null => {
    if (!name.trim()) return 'A company name is required.';
    if (!category) return 'Choose a category.';
    if (valuation !== '' && (Number.isNaN(Number(valuation)) || Number(valuation) < 0)) {
      return 'The valuation must be a number in euros, and cannot be negative.';
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      return 'That contact email does not look like an address.';
    }
    if (websiteUrl.trim() && /\s/.test(websiteUrl.trim())) {
      return 'The website URL cannot contain spaces.';
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const problem = validate();
    if (problem) { setError(problem); return; }

    setSaving(true);
    try {
      if (editing) {
        const res = await companiesAPI.update(initial.id, payload);
        await uploadPending(initial.id);
        setNotice('Saved.');
        onSaved?.(res.data.company);
      } else {
        const res = await companiesAPI.create(payload);
        const created = res.data.company;
        // The profile is saved before the files go up. If an upload fails the
        // company still exists and the admin can retry from the edit page
        // rather than losing everything they typed.
        try {
          await uploadPending(created.id);
        } catch {
          setError('The company was created, but some files did not upload. Open it to try again.');
        }
        onSaved?.(created);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save this company.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete “${initial.name}”? This also deletes its documents and cannot be undone.`)) return;
    setSaving(true);
    try {
      await companiesAPI.remove(initial.id);
      router.push('/companies');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not delete this company.');
      setSaving(false);
    }
  };

  // What Preview shows for the logo and banner: the queued file if one was
  // just picked, otherwise whatever the saved profile already has.
  const logoPreview = pendingOf('LOGO')[0]?.preview
    || (initial?.logoUrl ? mediaSrc(initial.logoUrl) : null);
  const bannerPreview = pendingOf('BANNER')[0]?.preview
    || (initial?.bannerUrl ? mediaSrc(initial.bannerUrl) : null);

  /** An image upload field with its own guidance beside it. */
  const imageField = (
    purpose: 'LOGO' | 'BANNER',
    label: string,
    hint: React.ReactNode,
  ) => {
    const queued = pendingOf(purpose)[0];
    const shown = queued?.preview || (purpose === 'LOGO' ? logoPreview : bannerPreview);
    return (
      <div className="pj-field">
        <label className="pj-label">{label}</label>
        <div className="cp-upload-row">
          {purpose === 'LOGO' ? (
            <span className="cp-logo cp-logo-lg">
              {shown
                ? <img src={shown} alt="" />
                : <span className="cp-logo-fallback">
                    {(name || '?').slice(0, 2).toUpperCase()}
                  </span>}
            </span>
          ) : (
            <div className="cp-banner-preview" style={{ width: 220 }}>
              {shown ? <img src={shown} alt="" /> : <span className="pj-card-banner-empty">Banner</span>}
            </div>
          )}

          <div>
            <label className="pj-btn pj-btn-sm" style={{ cursor: 'pointer' }}>
              {shown ? 'Replace' : 'Choose file'}
              <input type="file" hidden accept={ACCEPT_IMAGE}
                onChange={(e) => { addFiles(e.target.files, purpose, true); e.target.value = ''; }} />
            </label>
            {queued && (
              <button type="button" className="pj-btn pj-btn-sm pj-btn-ghost"
                style={{ marginInlineStart: 8 }} onClick={() => removePending(queued)}>
                Clear
              </button>
            )}
            <div className="cp-upload-hint" style={{ marginTop: 8 }}>{hint}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <form className="pj-form" onSubmit={submit}>
        {error && <div className="pj-error">{error}</div>}
        {notice && <div className="pj-ok">{notice}</div>}

        {/* ── Identity ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Company</div>

          <div className="pj-field" style={{ marginBottom: 14 }}>
            <label className="pj-label" htmlFor="cp-name">Company name *</label>
            <input id="cp-name" className="pj-input" value={name} required
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Adriatic Marine Holding" />
          </div>

          <div className="pj-form-grid">
            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-category">Category *</label>
              <select id="cp-category" className="pj-select" value={category} required
                onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
                {/* A company created before this list keeps its own category. */}
                {category && !CATEGORIES.includes(category) && (
                  <option value={category}>{pretty(category)}</option>
                )}
              </select>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-valuation">Valuation (€)</label>
              <input id="cp-valuation" className="pj-input" type="number" min={0} step="any"
                inputMode="decimal" value={valuation}
                onChange={(e) => setValuation(e.target.value)} placeholder="12000000" />
              <span className="pj-hint">Euros only — every figure in the portal is €.</span>
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-established">Establishment date</label>
              <input id="cp-established" className="pj-input" type="date" value={establishedAt}
                onChange={(e) => setEstablishedAt(e.target.value)} />
            </div>

            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-status">Status</label>
              <select id="cp-status" className="pj-select" value={status}
                onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
              </select>
              <span className="pj-hint">Draft and archived profiles are visible to admins only.</span>
            </div>
          </div>

          <div className="pj-field" style={{ marginTop: 14 }}>
            <label className="pj-label" htmlFor="cp-locations">Locations</label>
            <TagInput id="cp-locations" value={locations} onChange={setLocations}
              placeholder="City or country, then Enter — several is fine" />
            <span className="pj-hint">Each location becomes a filter on the companies listing.</span>
          </div>

          <div className="pj-field" style={{ marginTop: 14 }}>
            <label className="pj-label" htmlFor="cp-description">Short description</label>
            <textarea id="cp-description" className="pj-textarea" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One or two sentences — this is what appears on the company card." />
            <span className="pj-hint">
              Left empty, this is taken from the opening of the full description below.
            </span>
          </div>
        </div>

        {/* ── Logo & banner ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Logo &amp; banner</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {imageField('LOGO', 'Company logo', (
              <>
                <strong>Recommended: 512 × 512 px</strong>, square, PNG or SVG with a
                transparent background. Shown at 56–92 px, so fine detail will not read.
              </>
            ))}
            {imageField('BANNER', 'Banner image', (
              <>
                <strong>Recommended: 1600 × 500 px</strong> (16:5), JPG or PNG, under 2 MB.
                The company name sits over the lower-left corner, so keep that area clear.
              </>
            ))}
          </div>
        </div>

        {/* ── Rich text ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Full description</div>
          <RichTextEditor
            value={initial?.detailsHtml || ''}
            documentKey={initial?.id || 'new-company'}
            onChange={setDetailsHtml}
            onRequestImage={insertBodyImage}
            placeholder="The company story: headings, lists, tables, links and images…"
          />
          <span className="pj-hint" style={{ display: 'block', marginTop: 8 }}>
            {editing
              ? 'Images inserted here are uploaded to this company and served through the portal’s authorised viewer.'
              : 'Save the profile first to be able to insert uploaded images into this description.'}
          </span>
        </div>

        {/* ── People ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Owners &amp; team</div>
          <div className="pj-form-row">
            <div className="pj-field">
              <label className="pj-label">Company owners</label>
              <MemberSelect multiple allowFreeText value={owners} onChange={setOwners}
                placeholder="Add an owner…" />
              <span className="pj-hint">
                Several owners are supported. Members become a filter on the listing.
              </span>
            </div>
            <div className="pj-field">
              <label className="pj-label">Team members</label>
              <MemberSelect multiple allowFreeText value={teamMembers} onChange={setTeamMembers}
                placeholder="Add a team member…" />
              <span className="pj-hint">
                Owners and team members may be people who are not portal members — type a
                name and choose “Add”.
              </span>
            </div>
          </div>
        </div>

        {/* ── Contact & enquiries ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Contact &amp; enquiries</div>

          <div className="pj-form-row">
            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-website">Website URL</label>
              <input id="cp-website" className="pj-input" value={websiteUrl} inputMode="url"
                onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
              <span className="pj-hint">Shown on the company profile.</span>
            </div>
            <div className="pj-field">
              <label className="pj-label" htmlFor="cp-person">Contact person</label>
              <input id="cp-person" className="pj-input" value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)} placeholder="Full name" />
              <span className="pj-hint">A name only — shown on the profile.</span>
            </div>
          </div>

          <div className="pj-hint" style={{ marginTop: 14 }}>
            “Connect Now” messages go to the portal&rsquo;s enquiry recipient, set once for
            every project and company in <strong>Admin Panel → Enquiries</strong>.
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <span className="pj-label" style={{ display: 'block', marginBottom: 4 }}>
              Private — administration only
            </span>
            <span className="pj-hint" style={{ display: 'block', marginBottom: 12 }}>
              These are no longer displayed anywhere in the portal. Members reach the company
              through “Connect Now”.
            </span>
            <div className="pj-form-row">
              <div className="pj-field">
                <label className="pj-label" htmlFor="cp-email">Contact email</label>
                <input id="cp-email" className="pj-input" type="email" value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div className="pj-field">
                <label className="pj-label" htmlFor="cp-phone">Contact phone</label>
                <input id="cp-phone" className="pj-input" value={contactPhone} inputMode="tel"
                  onChange={(e) => setContactPhone(e.target.value)} placeholder="+39 02 1234567" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Files ── */}
        <div className="pj-panel">
          <div className="pj-panel-title">Gallery, documents &amp; video</div>

          <div className="pj-form-grid">
            <div className="pj-field">
              <label className="pj-label">Gallery images</label>
              <div className="pj-drop" onClick={() => galleryRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files, 'GALLERY'); }}>
                <div className="pj-drop-title">Add images</div>
                <div className="pj-drop-sub">
                  Several at once. JPG, PNG, WebP or SVG, {imageLimitHint}.
                </div>
              </div>
              <input ref={galleryRef} type="file" multiple hidden accept={ACCEPT_IMAGE}
                onChange={(e) => { addFiles(e.target.files, 'GALLERY'); e.target.value = ''; }} />
            </div>

            <div className="pj-field">
              <label className="pj-label">Documents</label>
              <div className="pj-drop" onClick={() => docRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files, 'DOCUMENT'); }}>
                <div className="pj-drop-title">Add PDF or Word files</div>
                <div className="pj-drop-sub">
                  PDF and .docx open in the portal, {documentLimitHint}. Legacy .doc
                  cannot be rendered.
                </div>
              </div>
              <input ref={docRef} type="file" multiple hidden accept={ACCEPT_DOC}
                onChange={(e) => { addFiles(e.target.files, 'DOCUMENT'); e.target.value = ''; }} />
            </div>

            <div className="pj-field">
              <label className="pj-label">Presentation video</label>
              <div className="pj-drop" onClick={() => videoRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files, 'VIDEO'); }}>
                <div className="pj-drop-title">Upload video</div>
                <div className="pj-drop-sub">MP4, WebM or MOV, up to 300 MB each.</div>
              </div>
              <input ref={videoRef} type="file" multiple hidden accept={ACCEPT_VIDEO}
                onChange={(e) => { addFiles(e.target.files, 'VIDEO'); e.target.value = ''; }} />
            </div>
          </div>

          {/* Queued files, grouped so it is clear where each one will land. */}
          {(['GALLERY', 'DOCUMENT', 'VIDEO'] as const).map((purpose) => {
            const group = pendingOf(purpose);
            if (group.length === 0) return null;
            return (
              <div key={purpose} style={{ marginTop: 14 }}>
                <span className="pj-label">{pretty(purpose)} — {group.length} queued</span>
                <div className="pj-previews">
                  {group.map((item, i) => (
                    <div className="pj-preview" key={`${item.file.name}-${i}`}>
                      <div className="pj-preview-thumb">
                        {item.preview
                          ? <img src={item.preview} alt="" />
                          : <span className="pj-media-kind">
                              {item.file.type === 'application/pdf' ? 'PDF'
                                : item.file.type.startsWith('video/') ? 'VIDEO' : 'WORD'}
                            </span>}
                      </div>
                      <div className="pj-preview-name" title={item.file.name}>{item.file.name}</div>
                      <button type="button" className="pj-preview-remove"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={(e) => { e.stopPropagation(); removePending(item); }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* ── Embedded video links ── */}
          <div style={{ marginTop: 20 }}>
            <span className="pj-label" style={{ display: 'block', marginBottom: 8 }}>
              Or embed a presentation link
            </span>
            <div className="pj-form-row">
              <input className="pj-input" value={linkDraft} inputMode="url"
                placeholder="YouTube or Vimeo URL"
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVideoLink(); } }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="pj-input" value={linkTitle} placeholder="Title (optional)"
                  onChange={(e) => setLinkTitle(e.target.value)} />
                <button type="button" className="pj-btn pj-btn-sm" onClick={addVideoLink}>Add</button>
              </div>
            </div>
            <span className="pj-hint" style={{ display: 'block', marginTop: 6 }}>
              Only YouTube and Vimeo are accepted — an arbitrary URL would be another site
              running inside the portal.
            </span>

            {videoLinks.length > 0 && (
              <div className="pj-picker-selected" style={{ marginTop: 10 }}>
                {videoLinks.map((link) => (
                  <span className="pj-token" key={link.url}>
                    <span>{link.title || 'Presentation'}</span>
                    <button type="button" aria-label={`Remove ${link.title || link.url}`}
                      onClick={() => setVideoLinks(videoLinks.filter((v) => v.url !== link.url))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {editing && (
            <div style={{ marginTop: 20 }}>
              <span className="pj-label" style={{ display: 'block', marginBottom: 10 }}>
                Already attached
              </span>
              <CompanyMedia
                companyId={initial.id}
                canManage
                logoDocId={initial.logoDocId}
                bannerDocId={initial.bannerDocId}
                videoLinks={videoLinks}
              />
            </div>
          )}
        </div>

        <div className="pj-form-actions">
          {/* Irreversible, like project deletion: super admin only. An admin
              creates and edits companies but does not remove them. */}
          {editing && isSuperAdminRole(user?.role) && (
            <button type="button" className="pj-btn pj-btn-danger" onClick={remove} disabled={saving}>
              Delete company
            </button>
          )}
          <button type="button" className="pj-btn pj-btn-ghost" onClick={() => router.back()} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="pj-btn" onClick={() => {
            const problem = validate();
            if (problem) { setError(problem); return; }
            setError('');
            setPreview(true);
          }}>
            Preview
          </button>
          <button type="submit" className="pj-btn pj-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create company'}
          </button>
        </div>
      </form>

      {/* ── Preview ── */}
      {/* Rendered from the form's current state, not from the server, so it
        * shows unsaved edits. It reuses the profile's own panel and rich-text
        * classes, so what is previewed is what will be published. */}
      {preview && (
        <div className="pj-viewer-overlay" role="dialog" aria-modal="true" aria-label="Profile preview"
          onClick={() => setPreview(false)}>
          <div className="cp-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cp-preview-bar">
              <span className="cp-preview-badge">Preview — not yet saved</span>
              <button type="button" className="pj-viewer-close" onClick={() => setPreview(false)}
                aria-label="Close preview">×</button>
            </div>

            <div style={{ padding: 20 }}>
              <div className="pj-detail-banner">
                {bannerPreview
                  ? <img src={bannerPreview} alt="" />
                  : <span className="pj-card-banner-empty">{category ? pretty(category) : 'Banner'}</span>}
                <div className="pj-detail-banner-overlay">
                  <div className="cp-detail-identity">
                    <span className="cp-logo cp-logo-lg">
                      {logoPreview
                        ? <img src={logoPreview} alt="" />
                        : <span className="cp-logo-fallback">
                            {(name || '?').slice(0, 2).toUpperCase()}
                          </span>}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h1 className="pj-detail-name">{name || 'Untitled company'}</h1>
                      <div style={{ fontSize: 12.5, color: 'rgba(232,234,246,0.85)', marginTop: 6 }}>
                        {category ? pretty(category) : '—'}
                        {locations.length > 0 ? ` · ${locations.join(' · ')}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'end' }}>
                    <span className="pj-valuation-label">Valuation</span>
                    <span className="pj-valuation" style={{ fontSize: 22 }}>
                      {valuation === '' ? '—' : formatEur(Number(valuation))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pj-panel" style={{ marginTop: 16 }}>
                <div className="pj-panel-title">At a glance</div>
                <div className="pj-facts">
                  <div className="pj-fact">
                    <div className="pj-fact-label">Status</div>
                    <div className="pj-fact-value">{pretty(status)}</div>
                  </div>
                  <div className="pj-fact">
                    <div className="pj-fact-label">Established</div>
                    <div className="pj-fact-value">
                      {establishedAt ? new Date(establishedAt).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <div className="pj-fact">
                    <div className="pj-fact-label">Owners</div>
                    <div className="pj-fact-value">
                      {owners.length > 0 ? owners.map((o) => o.name).join(', ') : '—'}
                    </div>
                  </div>
                  <div className="pj-fact">
                    <div className="pj-fact-label">Team</div>
                    <div className="pj-fact-value">
                      {teamMembers.length > 0 ? teamMembers.map((o) => o.name).join(', ') : '—'}
                    </div>
                  </div>
                  <div className="pj-fact">
                    <div className="pj-fact-label">Website</div>
                    <div className="pj-fact-value">{websiteUrl || '—'}</div>
                  </div>
                  <div className="pj-fact">
                    {/* Contact person only: the email and phone are not shown to
                      * members, so previewing them here would misrepresent the
                      * published profile. */}
                    <div className="pj-fact-label">Contact person</div>
                    <div className="pj-fact-value">{contactPerson || '—'}</div>
                  </div>
                </div>
              </div>

              {description && (
                <div className="pj-panel">
                  <div className="pj-panel-title">Summary</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                    {description}
                  </div>
                </div>
              )}

              <div className="pj-panel">
                <div className="pj-panel-title">Full description</div>
                {detailsHtml
                  // Preview only, and this is the admin's own unsaved markup
                  // from the editor in this tab. It is sanitised server-side
                  // on save, which is what every reader will see.
                  ? <div className="pj-rich" dangerouslySetInnerHTML={{ __html: detailsHtml }} />
                  : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing written yet.</div>}
              </div>

              <div className="pj-form-actions" style={{ paddingBottom: 4 }}>
                <button type="button" className="pj-btn pj-btn-ghost" onClick={() => setPreview(false)}>
                  Keep editing
                </button>
                <button type="button" className="pj-btn pj-btn-primary" disabled={saving}
                  onClick={(e) => { setPreview(false); submit(e as unknown as React.FormEvent); }}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create company'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
