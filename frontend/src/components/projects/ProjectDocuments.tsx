'use client';
// src/components/projects/ProjectDocuments.tsx
//
// A project's Documents & Gallery: every uploaded image, PDF and video, opened
// in the in-portal viewer (SecureViewer) and never downloaded.
//
// Images and documents are listed separately because they are browsed
// differently — a gallery is scanned, a document list is read — but they come
// from the same endpoint and the same viewer, so the arrow keys still move
// through whichever group was opened.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { projectsAPI, mediaSrc, formatNumber } from '@/lib/api';
import SecureViewer, { MediaItem, noCopy } from './SecureViewer';

const readableSize = (bytes?: number) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${formatNumber(mb, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
    : `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
};

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime';

export default function ProjectDocuments({
  projectId, canManage, viewerLabel, bannerDocId, onSetBanner, onChanged,
}: {
  projectId: string;
  canManage?: boolean;
  /** Who is viewing — watermarked onto every preview. */
  viewerLabel?: string;
  bannerDocId?: string | null;
  /** Admin picked a different banner image. */
  onSetBanner?: (docId: string) => void;
  /** Something was uploaded or removed, so the project should be refetched. */
  onChanged?: () => void;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  // The viewer walks one of the two groups, so it holds a list and an index
  // rather than a single item.
  const [viewing, setViewing] = useState<{ group: MediaItem[]; index: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return projectsAPI.listMedia(projectId)
      .then((r) => setMedia(r.data.media || []))
      .catch(() => setError('Could not load this project’s files.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const images = useMemo(() => media.filter((m) => m.kind === 'IMAGE'), [media]);
  const docs   = useMemo(() => media.filter((m) => m.kind !== 'IMAGE'), [media]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      await projectsAPI.uploadMedia(projectId, form);
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`Remove “${item.name}”? This deletes the file.`)) return;
    setError('');
    try {
      await projectsAPI.removeMedia(projectId, item.id);
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not remove that file.');
    }
  };

  const open = (group: MediaItem[], index: number) => setViewing({ group, index });

  const step = (delta: number) => setViewing((v) => {
    if (!v) return v;
    const total = v.group.length;
    // Wraps, so the arrow keys never dead-end in the middle of a gallery.
    return { ...v, index: (v.index + delta + total) % total };
  });

  const tile = (item: MediaItem, group: MediaItem[], index: number) => (
    <div className="pj-media-card" key={item.id}>
      <button
        type="button"
        className="pj-media-thumb"
        onClick={() => open(group, index)}
        title={`View ${item.name}`}
      >
        {item.kind === 'IMAGE' ? (
          <img {...noCopy} src={mediaSrc(item.streamUrl)} alt={item.name} loading="lazy" />
        ) : (
          <span className="pj-media-kind">{item.kind === 'VIDEO' ? '▶ VIDEO' : 'PDF'}</span>
        )}
        {item.id === bannerDocId && <span className="pj-media-banner-flag">Banner</span>}
      </button>

      <div className="pj-media-info">
        <div className="pj-media-name" title={item.name}>{item.name}</div>
        <div className="pj-media-sub">
          <span>{item.kind}{item.sizeBytes ? ` · ${readableSize(item.sizeBytes)}` : ''}</span>
          {canManage && <button type="button" onClick={() => remove(item)}>Remove</button>}
        </div>
        {canManage && item.kind === 'IMAGE' && onSetBanner && item.id !== bannerDocId && (
          <button
            type="button"
            className="pj-btn pj-btn-sm pj-btn-ghost"
            style={{ marginTop: 7, width: '100%' }}
            onClick={() => onSetBanner(item.id)}
          >
            Use as banner
          </button>
        )}
      </div>
    </div>
  );

  const uploader = canManage && (
    <label className={`pj-drop${uploading ? ' over' : ''}`} style={{ display: 'block' }}>
      <div className="pj-drop-title">{uploading ? 'Uploading…' : 'Add images, PDFs or video'}</div>
      <div className="pj-drop-sub">
        Multiple files at once. Stored privately and viewable only inside the portal.
      </div>
      <input
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        disabled={uploading}
        onChange={(e) => { upload(e.target.files); e.target.value = ''; }}
      />
    </label>
  );

  if (loading && media.length === 0) {
    return <div className="pj-panel"><div className="pj-panel-title">Documents &amp; gallery</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div></div>;
  }

  return (
    <>
      {error && <div className="pj-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="pj-panel">
        <div className="pj-panel-title">Gallery · {images.length} image{images.length === 1 ? '' : 's'}</div>
        {images.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No images yet.</div>
        ) : (
          <div className="pj-media-grid">
            {images.map((item, i) => tile(item, images, i))}
          </div>
        )}
      </div>

      <div className="pj-panel">
        <div className="pj-panel-title">Documents · {docs.length} file{docs.length === 1 ? '' : 's'}</div>
        {docs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No documents yet.</div>
        ) : (
          <div className="pj-media-grid">
            {docs.map((item, i) => tile(item, docs, i))}
          </div>
        )}

        <p className="pj-viewer-note" style={{ marginTop: 14 }}>
          Documents open in the portal’s own viewer. They are not downloadable and every
          preview is watermarked.
        </p>
      </div>

      {uploader && <div className="pj-panel">{uploader}</div>}

      {viewing && (
        <SecureViewer
          item={viewing.group[viewing.index]}
          viewerLabel={viewerLabel}
          position={{ index: viewing.index, total: viewing.group.length }}
          onClose={() => setViewing(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}
    </>
  );
}
