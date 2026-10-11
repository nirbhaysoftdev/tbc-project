'use client';
// src/components/community/ProjectMedia.tsx
//
// Deal-room media gallery: images, PDFs and video, all viewed in place.
//
// Members may look but not take a copy, so nothing here offers a download: no
// anchor to the file, no "save" control, native media controls have their
// download button removed, the PDF viewer opens with its toolbar hidden, and
// right-click and drag are suppressed over the media itself.
//
// Worth being clear-eyed about the limit: the bytes still reach the browser in
// order to be displayed, so a determined viewer can reach them through devtools
// or simply screenshot the screen. This removes the download paths a member
// would actually use; it is not DRM.
import { useCallback, useEffect, useState } from 'react';
import { projectsAPI, mediaSrc } from '@/lib/api';

export interface MediaItem {
  id: string;
  name: string;
  kind: 'IMAGE' | 'PDF' | 'VIDEO';
  type?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  streamUrl: string;
}

const KIND_LABEL: Record<MediaItem['kind'], string> = {
  IMAGE: 'Image',
  PDF:   'Document',
  VIDEO: 'Video',
};

const readableSize = (bytes?: number) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// Applied to every element that actually renders media.
const noCopy = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart:   (e: React.DragEvent)  => e.preventDefault(),
  draggable: false,
  style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
};

export default function ProjectMedia({
  projectId, canManage,
}: {
  projectId: string;
  canManage?: boolean;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    return projectsAPI.listMedia(projectId)
      .then(r => setMedia(r.data.media || []))
      .catch(() => setError('Could not load project media'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Esc closes the viewer, like the other community modals.
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      await projectsAPI.uploadMedia(projectId, fd);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem) => {
    setError('');
    try {
      await projectsAPI.removeMedia(projectId, item.id);
      setMedia(prev => prev.filter(m => m.id !== item.id));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not remove this file');
    }
  };

  if (loading && media.length === 0 && !canManage) return null;
  if (!loading && media.length === 0 && !canManage) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform:'uppercase', letterSpacing: 0.5 }}>
          Media &amp; Documents
        </div>
        {canManage && (
          <label style={{ fontSize: 11, color: 'var(--gold)', cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Uploading…' : '+ Upload image / PDF / video'}
            <input
              type="file" multiple hidden disabled={uploading}
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"
              onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>

      {error && <p className="form-error" style={{ textAlign:'left' }}>{error}</p>}

      {media.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {loading ? 'Loading…' : 'Nothing uploaded yet.'}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {media.map(item => (
            <div key={item.id} className="comm-project-card"
              style={{ padding: 0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <button
                onClick={() => setViewing(item)}
                title={`View ${item.name}`}
                style={{ border:'none', background:'var(--bg-active)', padding:0, cursor:'pointer',
                         height: 96, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {item.kind === 'IMAGE' ? (
                  <img {...noCopy} src={mediaSrc(item.streamUrl)} alt={item.name}
                    style={{ ...noCopy.style, width:'100%', height:'100%', objectFit:'cover' }} />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                                 color:'var(--text-secondary)' }}>
                    {item.kind === 'VIDEO' ? '▶ VIDEO' : 'PDF'}
                  </span>
                )}
              </button>
              <div style={{ padding:'8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow:'hidden',
                              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 10, color:'var(--text-muted)', display:'flex',
                              justifyContent:'space-between', gap: 6, marginTop: 2 }}>
                  <span>{KIND_LABEL[item.kind]}{item.sizeBytes ? ` · ${readableSize(item.sizeBytes)}` : ''}</span>
                  {canManage && (
                    <button onClick={() => remove(item)}
                      style={{ border:'none', background:'none', padding:0, fontSize:10,
                               color:'var(--red)', cursor:'pointer' }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── In-page viewer ── */}
      {viewing && (
        <div className="comm-modal-overlay" onClick={() => setViewing(null)}>
          <div className="comm-modal" onClick={e => e.stopPropagation()}
            style={{ width:'min(980px, 94vw)', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, marginBottom: 10 }}>
              <div className="comm-modal-title" style={{ marginBottom: 0 }}>{viewing.name}</div>
              <button onClick={() => setViewing(null)}
                style={{ border:'none', background:'none', fontSize: 18, lineHeight: 1,
                         color:'var(--text-muted)', cursor:'pointer' }}>
                ×
              </button>
            </div>

            <div {...noCopy} style={{ ...noCopy.style, flex: 1, minHeight: 0, background:'var(--bg-active)',
                                      borderRadius: 8, overflow:'hidden', display:'flex',
                                      alignItems:'center', justifyContent:'center' }}>
              {viewing.kind === 'IMAGE' && (
                <img {...noCopy} src={mediaSrc(viewing.streamUrl)} alt={viewing.name}
                  style={{ ...noCopy.style, maxWidth:'100%', maxHeight:'78vh', objectFit:'contain' }} />
              )}

              {viewing.kind === 'VIDEO' && (
                <video
                  {...noCopy}
                  src={mediaSrc(viewing.streamUrl)}
                  controls
                  controlsList="nodownload noremoteplayback noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  style={{ ...noCopy.style, width:'100%', maxHeight:'78vh' }}
                />
              )}

              {viewing.kind === 'PDF' && (
                // #toolbar=0 drops the built-in viewer's save and print buttons.
                <iframe
                  title={viewing.name}
                  src={`${mediaSrc(viewing.streamUrl)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  style={{ width:'100%', height:'78vh', border:'none' }}
                />
              )}
            </div>

            <p style={{ fontSize: 11, color:'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              For viewing only — this material may not be downloaded, copied or shared.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
