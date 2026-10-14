'use client';
// src/components/projects/SecureViewer.tsx
//
// The in-portal viewer, shared by the project and company modules: images in
// an image viewer, PDFs and Word documents in an embedded document viewer,
// uploaded video inline, and embedded presentation video in a sandboxed
// player. Nothing here offers a download or a print.
//
// It lives under components/projects because that is where it was written;
// the company module imports it rather than growing a second copy.
//
// What it actually does:
//   - the bytes are only ever reachable through the ticketed streaming
//     endpoint, so there is no file URL to copy, share or bookmark (backend
//     projectMediaController.js);
//   - no anchor, no download control, no print control;
//   - the PDF is framed with `#toolbar=0`, which drops the built-in viewer's
//     save and print buttons;
//   - `controlsList="nodownload"` removes the video element's own download
//     item;
//   - right-click, drag and the common save/print keystrokes are suppressed
//     while the viewer is open;
//   - every page carries a repeated "Trillion Business Community" copyright
//     mark, so a screenshot or a photo of the screen still shows whose
//     material it is.
//
// What it does NOT do, and cannot: stop a determined viewer. The bytes must
// reach the browser to be displayed, so devtools, the network tab, a phone
// camera or the OS screenshot key all remain. Browser devtools cannot be
// disabled. This is a strong set of deterrents and access controls, not DRM —
// the access control on the server is the part that actually protects the
// file, and it is the part that cannot be bypassed from the client.
import React, { useCallback, useEffect, useState } from 'react';
import { mediaSrc } from '@/lib/api';

export interface MediaItem {
  id: string;
  name: string;
  // IMAGE / PDF / VIDEO are streamed from the API. DOC is a Word file, which
  // no browser renders natively, so it arrives as sanitised HTML from the
  // server instead (see `loadDocHtml`). EMBED is a third-party presentation
  // video, which is an already-normalised provider URL rather than our bytes.
  kind: 'IMAGE' | 'PDF' | 'VIDEO' | 'DOC' | 'EMBED';
  type?: string;
  purpose?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  streamUrl: string;
  /** DOC only: the ticketed URL the HTML preview is fetched from. */
  previewUrl?: string;
  /** EMBED only: the provider's embed URL. */
  embedUrl?: string;
}

// Spread onto anything that renders the media itself.
export const noCopy = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  draggable: false,
  style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
};

/**
 * The copyright mark laid over every preview.
 *
 * One fixed string, the community's name and nothing else — no viewer name, no
 * email address, no timestamp.
 *
 * Tiled and rotated rather than placed once: a single mark in a corner is
 * trivially cropped out, while a repeated one cannot be removed from a
 * screenshot without destroying the content along with it.
 *
 * Rendered for every kind of media and for every viewer, with no condition on
 * it — a copyright assertion that is sometimes absent is not an assertion.
 */
const COPYRIGHT_MARK = 'Trillion Business Community';

function Watermark() {
  const tiles = Array.from({ length: 24 });
  return (
    <div className="pj-watermark" aria-hidden="true">
      {tiles.map((_, i) => <span key={i}>{COPYRIGHT_MARK}</span>)}
    </div>
  );
}

export default function SecureViewer({
  item, onClose, onPrev, onNext, position, loadDocHtml,
}: {
  item: MediaItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number };
  /**
   * Fetches a Word document's HTML. Passed in rather than imported so this
   * component stays independent of which module's API it is showing.
   */
  loadDocHtml?: (item: MediaItem) => Promise<string>;
}) {
  const src = mediaSrc(item.streamUrl);

  // Word documents: the converted HTML, loaded on open. The server sanitises
  // it before it is sent (backend companyMediaController.js), which is what
  // makes it safe to render here — a .docx is arbitrary input and must not be
  // able to run script in a member's browser.
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docError, setDocError] = useState('');

  useEffect(() => {
    if (item.kind !== 'DOC') { setDocHtml(null); setDocError(''); return; }
    if (!loadDocHtml) { setDocError('This document cannot be previewed.'); return; }
    let cancelled = false;
    setDocHtml(null);
    setDocError('');
    loadDocHtml(item)
      .then((html) => { if (!cancelled) setDocHtml(html); })
      .catch((err) => {
        if (cancelled) return;
        setDocError(err?.response?.data?.error
          || 'This document could not be converted for viewing.');
      });
    return () => { cancelled = true; };
  }, [item, loadDocHtml]);

  // Esc closes; the arrows move through the gallery.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft' && onPrev) onPrev();
    else if (e.key === 'ArrowRight' && onNext) onNext();
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // Save and print shortcuts are suppressed WHILE THE VIEWER IS OPEN only.
  // Hanging these on the document for the whole session would break Ctrl+P on
  // every other page, and a member printing a page that is not a confidential
  // document is not something to prevent.
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', block, true);
    // The page behind the viewer must not scroll while a modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', block, true);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="pj-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={onClose}
    >
      <div className="pj-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="pj-viewer-head">
          <div className="pj-viewer-title">{item.name}</div>
          <div className="pj-viewer-nav">
            {position && position.total > 1 && (
              <>
                <button type="button" className="pj-btn pj-btn-sm" onClick={onPrev} aria-label="Previous file">‹</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {position.index + 1} / {position.total}
                </span>
                <button type="button" className="pj-btn pj-btn-sm" onClick={onNext} aria-label="Next file">›</button>
              </>
            )}
            <button type="button" className="pj-viewer-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="pj-viewer-stage" {...noCopy}>
          {item.kind === 'IMAGE' && (
            <img {...noCopy} src={src} alt={item.name} style={{ ...noCopy.style }} />
          )}

          {item.kind === 'VIDEO' && (
            <video
              {...noCopy}
              src={src}
              controls
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              playsInline
            />
          )}

          {item.kind === 'DOC' && (
            // Scrollable, and `.pj-rich` styles the document's own headings,
            // lists and tables to match the portal.
            <div
              className="pj-rich"
              style={{ width: '100%', height: '78vh', overflowY: 'auto',
                       padding: '24px 28px', background: '#0b1022' }}
            >
              {docError
                ? <p style={{ color: 'var(--red)' }}>{docError}</p>
                : docHtml === null
                  ? <p style={{ color: 'var(--text-muted)' }}>Preparing document…</p>
                  : docHtml
                    ? <div dangerouslySetInnerHTML={{ __html: docHtml }} />
                    : <p style={{ color: 'var(--text-muted)' }}>This document has no readable content.</p>}
            </div>
          )}

          {item.kind === 'EMBED' && item.embedUrl && (
            // A third-party player. `sandbox` keeps it from reaching the
            // portal around it, and the provider URL was restricted to an
            // allowlist on write (backend companiesController.js).
            <iframe
              title={item.name}
              src={item.embedUrl}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}

          {item.kind === 'PDF' && (
            // #toolbar=0 hides the built-in viewer's save and print controls.
            // The PDF renders inside the portal; it is never opened in a tab
            // of its own, where that toolbar would come back.
            <iframe
              title={item.name}
              src={`${src}#toolbar=0&navpanes=0&statusbar=0&scrollbar=1&view=FitH`}
            />
          )}

          <Watermark />
        </div>

        <p className="pj-viewer-note">
          © {new Date().getFullYear()} Trillion Business Community. For viewing inside the
          portal only — this material may not be downloaded, copied, printed or shared.
        </p>
      </div>
    </div>
  );
}
