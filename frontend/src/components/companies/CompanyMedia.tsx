'use client';
// src/components/companies/CompanyMedia.tsx
//
// A company's media, in three sections that match how each kind is actually
// browsed: the image gallery is scanned, documents are read, presentation
// videos are watched.
//
// Everything opens in SecureViewer — the same viewer the project module uses,
// extended there for Word documents and embedded video. Nothing here offers a
// download or a print, and every preview carries the Trillion Business
// Community copyright mark. The protection that actually holds is the
// ticketed, permission-checked endpoint on the server; the rest is deterrence.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { companiesAPI, mediaSrc, formatNumber } from '@/lib/api';
import { checkFileSizes } from '@/lib/uploadLimits';
import SecureViewer, { MediaItem, noCopy } from '@/components/projects/SecureViewer';

export interface VideoLink { url: string; title?: string; provider?: string }

const readableSize = (bytes?: number) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${formatNumber(mb, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
    : `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
};

const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
const ACCEPT_DOC = 'application/pdf,application/msword,'
  + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ACCEPT_VIDEO = 'video/mp4,video/webm,video/quicktime';

const KIND_BADGE: Record<string, string> = {
  PDF: 'cp-kind-pdf',
  DOC: 'cp-kind-doc',
  VIDEO: 'cp-kind-video',
};

/**
 * Fetches a Word document's HTML for the viewer.
 *
 * Declared at module scope so its identity is stable: SecureViewer takes it as
 * a dependency of the effect that loads a preview, and a function recreated on
 * every render would make that effect re-run forever.
 */
const loadDocHtml = async (item: MediaItem) => {
  if (!item.previewUrl) throw new Error('no preview url');
  const res = await companiesAPI.previewDoc(item.previewUrl);
  return res.data.html as string;
};

export default function CompanyMedia({
  companyId, canManage, logoDocId, bannerDocId, videoLinks, onChanged,
}: {
  companyId: string;
  canManage?: boolean;
  logoDocId?: string | null;
  bannerDocId?: string | null;
  videoLinks?: VideoLink[] | null;
  /** Something was uploaded, removed or re-pointed; refetch the company. */
  onChanged?: () => void;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  // The viewer walks one section, so it holds a list and an index.
  const [viewing, setViewing] = useState<{ group: MediaItem[]; index: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return companiesAPI.listMedia(companyId)
      .then((r) => setMedia(r.data.media || []))
      .catch(() => setError('Could not load this company’s files.'))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // The logo and banner are shown in their own place on the profile, so they
  // are kept out of the gallery rather than appearing twice.
  const images = useMemo(
    () => media.filter((m) => m.kind === 'IMAGE'
      && m.id !== logoDocId && m.id !== bannerDocId
      && m.purpose !== 'LOGO' && m.purpose !== 'BANNER'),
    [media, logoDocId, bannerDocId],
  );
  const docs   = useMemo(() => media.filter((m) => m.kind === 'PDF' || m.kind === 'DOC'), [media]);
  const videos = useMemo(() => media.filter((m) => m.kind === 'VIDEO'), [media]);

  // Embedded links are presented beside uploaded video. They are given the
  // shape SecureViewer expects so both open in the same player, with the
  // index-based navigation working across the two.
  const embeds: MediaItem[] = useMemo(
    () => (videoLinks || []).map((link, i) => ({
      id: `embed-${i}`,
      name: link.title || 'Presentation',
      kind: 'EMBED' as const,
      streamUrl: '',
      embedUrl: link.url,
    })),
    [videoLinks],
  );

  const allVideos = useMemo(() => [...videos, ...embeds], [videos, embeds]);

  const upload = async (files: FileList | null, purpose: string) => {
    if (!files || files.length === 0) return;

    // Refused before the request rather than after the bytes have gone up.
    // The server enforces the same ceilings (backend services/uploadLimits.js).
    const tooLarge = checkFileSizes(files);
    if (tooLarge) { setError(tooLarge); return; }

    setUploading(purpose);
    setError('');
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      form.append('purpose', purpose);
      await companiesAPI.uploadMedia(companyId, form);
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading('');
    }
  };

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`Remove “${item.name}”? This deletes the file.`)) return;
    setError('');
    try {
      await companiesAPI.removeMedia(companyId, item.id);
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not remove that file.');
    }
  };

  const point = async (field: 'logoDocId' | 'bannerDocId', docId: string) => {
    setError('');
    try {
      await companiesAPI.update(companyId, { [field]: docId });
      onChanged?.();
    } catch {
      setError('Could not update the profile image.');
    }
  };

  const step = (delta: number) => setViewing((v) => {
    if (!v) return v;
    const total = v.group.length;
    // Wraps, so the arrow keys never dead-end mid-gallery.
    return { ...v, index: (v.index + delta + total) % total };
  });

  /** An upload control, labelled for what it adds. */
  const uploadButton = (purpose: string, accept: string, label: string, multiple = true) => (
    <label className="pj-btn pj-btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
      {uploading === purpose ? 'Uploading…' : label}
      <input
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        disabled={Boolean(uploading)}
        onChange={(e) => { upload(e.target.files, purpose); e.target.value = ''; }}
      />
    </label>
  );

  const imageTile = (item: MediaItem, group: MediaItem[], index: number) => (
    <div className="pj-media-card" key={item.id}>
      <button type="button" className="pj-media-thumb" title={`View ${item.name}`}
        onClick={() => setViewing({ group, index })}>
        <img {...noCopy} src={mediaSrc(item.streamUrl)} alt={item.name} loading="lazy" />
      </button>
      <div className="pj-media-info">
        <div className="pj-media-name" title={item.name}>{item.name}</div>
        <div className="pj-media-sub">
          <span>{item.sizeBytes ? readableSize(item.sizeBytes) : 'Image'}</span>
          {canManage && <button type="button" onClick={() => remove(item)}>Remove</button>}
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            <button type="button" className="pj-btn pj-btn-sm pj-btn-ghost" style={{ flex: 1 }}
              onClick={() => point('logoDocId', item.id)}>Logo</button>
            <button type="button" className="pj-btn pj-btn-sm pj-btn-ghost" style={{ flex: 1 }}
              onClick={() => point('bannerDocId', item.id)}>Banner</button>
          </div>
        )}
      </div>
    </div>
  );

  const docTile = (item: MediaItem, group: MediaItem[], index: number) => (
    <div className="pj-media-card" key={item.id}>
      <button type="button" className="pj-media-thumb" title={`View ${item.name}`}
        onClick={() => setViewing({ group, index })}>
        <span className={`cp-kind-badge ${KIND_BADGE[item.kind] || 'cp-kind-doc'}`}>
          {item.kind === 'DOC' ? 'WORD' : item.kind}
        </span>
      </button>
      <div className="pj-media-info">
        <div className="pj-media-name" title={item.name}>{item.name}</div>
        <div className="pj-media-sub">
          <span>{readableSize(item.sizeBytes) || item.kind}</span>
          {canManage && <button type="button" onClick={() => remove(item)}>Remove</button>}
        </div>
      </div>
    </div>
  );

  const videoTile = (item: MediaItem, index: number) => (
    <div className="cp-video-card" key={item.id}>
      <button type="button" className="cp-video-thumb" title={`Play ${item.name}`}
        onClick={() => setViewing({ group: allVideos, index })}>
        <span className="cp-video-play" aria-hidden="true">▶</span>
        <span className="cp-video-provider">
          {item.kind === 'EMBED' ? (item.embedUrl?.includes('vimeo') ? 'Vimeo' : 'YouTube') : 'Upload'}
        </span>
      </button>
      <div className="cp-video-name" title={item.name}>{item.name}</div>
      {canManage && item.kind === 'VIDEO' && (
        <div className="pj-media-sub" style={{ padding: '0 11px 9px' }}>
          <span>{readableSize(item.sizeBytes)}</span>
          <button type="button" onClick={() => remove(item)}>Remove</button>
        </div>
      )}
    </div>
  );

  if (loading && media.length === 0) {
    return (
      <div className="pj-panel">
        <div className="pj-panel-title">Media</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="pj-error" style={{ marginBottom: 14 }}>{error}</div>}

      {/* ── Gallery ── */}
      <div className="pj-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="pj-panel-title" style={{ marginBottom: 0 }}>
            Gallery · {images.length} image{images.length === 1 ? '' : 's'}
          </div>
          {canManage && uploadButton('GALLERY', ACCEPT_IMAGE, '+ Add images')}
        </div>

        <div style={{ marginTop: 14 }}>
          {images.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No gallery images yet.</div>
          ) : (
            <div className="pj-media-grid">
              {images.map((item, i) => imageTile(item, images, i))}
            </div>
          )}
        </div>
      </div>

      {/* ── Documents ── */}
      <div className="pj-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="pj-panel-title" style={{ marginBottom: 0 }}>
            Documents · {docs.length} file{docs.length === 1 ? '' : 's'}
          </div>
          {canManage && uploadButton('DOCUMENT', ACCEPT_DOC, '+ Add PDF / Word')}
        </div>

        <div style={{ marginTop: 14 }}>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No documents yet.</div>
          ) : (
            <div className="pj-media-grid">
              {docs.map((item, i) => docTile(item, docs, i))}
            </div>
          )}
        </div>

        <p className="pj-viewer-note" style={{ marginTop: 14 }}>
          PDFs and Word documents open in the portal’s own viewer. They are not downloadable,
          and every preview carries the community's copyright mark. Legacy <code>.doc</code> files cannot be rendered in a
          browser — upload <code>.docx</code> or PDF to make a document readable here.
        </p>
      </div>

      {/* ── Presentation video ── */}
      <div className="pj-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="pj-panel-title" style={{ marginBottom: 0 }}>
            Presentation video · {allVideos.length}
          </div>
          {canManage && uploadButton('VIDEO', ACCEPT_VIDEO, '+ Upload video')}
        </div>

        <div style={{ marginTop: 14 }}>
          {allVideos.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No presentation video yet.
              {canManage && ' Upload a file, or add a YouTube or Vimeo link when editing the profile.'}
            </div>
          ) : (
            <div className="cp-video-grid">
              {allVideos.map((item, i) => videoTile(item, i))}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <SecureViewer
          item={viewing.group[viewing.index]}
          position={{ index: viewing.index, total: viewing.group.length }}
          loadDocHtml={loadDocHtml}
          onClose={() => setViewing(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}
    </>
  );
}
