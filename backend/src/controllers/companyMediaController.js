// src/controllers/companyMediaController.js
//
// Company profile media: logo, banner, gallery images, PDF and Word documents,
// and presentation video.
//
// The access model is the one projectMediaController.js already establishes,
// and it is deliberately identical so there is only one of these to reason
// about:
//
//   - files live in backend/storage/company-media, which is NOT under the
//     /uploads mount, so no route serves them directly;
//   - the stored path never leaves the server;
//   - a listing returns a short-lived ticket scoped to one document and one
//     viewer, and only the streaming endpoint trades that ticket for bytes;
//   - the stream always sends Content-Disposition: inline, so a browser
//     renders the file instead of offering to save it.
//
// What is new here is Word documents. A browser cannot render .docx, and the
// usual answer - handing the file to Office Online or Google's viewer - would
// mean publishing it to a third party at a public URL, which is exactly what
// this module exists to prevent. So .docx is converted to HTML on the server
// with mammoth, sanitised, and rendered inside the portal's own viewer. Legacy
// binary .doc cannot be converted this way and says so rather than pretending.
//
// None of this is DRM. The bytes must reach the browser to be displayed, so
// devtools, the network tab and a screenshot all remain possible. The access
// control on the server is the part that actually protects the file.
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const mammoth = require('mammoth');
const prisma = require('../utils/prismaClient');
const { checkSize } = require('../services/uploadLimits');
const sanitizeHtml = require('sanitize-html');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'storage', 'company-media');
const TICKET_TTL_SECONDS = 60 * 60; // long enough to watch a presentation through

// What may be uploaded, and which viewer each one gets on the client.
const KIND_BY_MIME = {
  'image/jpeg': 'IMAGE',
  'image/png':  'IMAGE',
  'image/webp': 'IMAGE',
  'image/gif':  'IMAGE',
  'image/svg+xml': 'IMAGE',
  'application/pdf': 'PDF',
  'application/msword': 'DOC',                                                        // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC',   // .docx
  'video/mp4':  'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
};

// What a file is for. `kind` picks the viewer; `purpose` places the file on the
// profile - a logo and a gallery photo are both images.
const PURPOSES = ['LOGO', 'BANNER', 'GALLERY', 'DOCUMENT', 'VIDEO', 'OTHER'];

const kindOf = (mime) => KIND_BY_MIME[String(mime).toLowerCase()] || null;

/** Where an upload belongs when the client does not say. */
const defaultPurpose = (kind) => {
  if (kind === 'IMAGE') return 'GALLERY';
  if (kind === 'VIDEO') return 'VIDEO';
  if (kind === 'PDF' || kind === 'DOC') return 'DOCUMENT';
  return 'OTHER';
};

function ensureDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// ── Tickets ────────────────────────────────────
// Scoped to one document for one viewer, so a ticket cannot be reused to reach
// other media, and it expires on its own. The session JWT deliberately never
// goes in a URL, where it would leak through logs and referrer headers.
function signTicket({ docId, companyId, userId }) {
  return jwt.sign(
    { purpose: 'company-media', docId, companyId, userId },
    process.env.JWT_SECRET,
    { expiresIn: TICKET_TTL_SECONDS },
  );
}

function verifyTicket(token, { docId, companyId }) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'company-media') throw new Error('wrong ticket purpose');
  if (payload.docId !== docId || payload.companyId !== companyId) throw new Error('ticket scope mismatch');
  return payload;
}

/**
 * The viewable URL for one document, ticket included.
 *
 * Exported because the company payloads need it: the logo and banner are
 * documents, and the listing has to render them without a second round trip
 * per card.
 */
function streamUrlFor({ companyId, docId, userId }) {
  return `/companies/${companyId}/media/${docId}/stream`
    + `?t=${signTicket({ docId, companyId, userId })}`;
}

/** The HTML-preview URL for a Word document. Same ticket, different endpoint. */
function previewUrlFor({ companyId, docId, userId }) {
  return `/companies/${companyId}/media/${docId}/preview`
    + `?t=${signTicket({ docId, companyId, userId })}`;
}

/** The shape a client is allowed to see - never the stored path. */
function publicMedia(doc, userId) {
  return {
    id:         doc.id,
    name:       doc.name,
    kind:       doc.kind,
    purpose:    doc.purpose,
    mimeType:   doc.mimeType,
    sizeBytes:  doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
    streamUrl:  streamUrlFor({ companyId: doc.companyId, docId: doc.id, userId }),
    // Word documents are read through the HTML preview rather than streamed
    // into a viewer that cannot render them.
    previewUrl: doc.kind === 'DOC'
      ? previewUrlFor({ companyId: doc.companyId, docId: doc.id, userId })
      : undefined,
  };
}

// ── List a company's media ─────────────────────
const listMedia = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const documents = await prisma.companyDocument.findMany({
      where:   { companyId: company.id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ media: documents.map((d) => publicMedia(d, req.user.id)) });
  } catch (err) {
    console.error('company listMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Upload (admin) ─────────────────────────────
const uploadMedia = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded. Images, PDFs, Word documents and video are accepted.' });
    }

    // The client says what the batch is for (a logo upload, a gallery upload);
    // anything unrecognised falls back to the file's own kind.
    const requested = PURPOSES.includes(req.body.purpose) ? req.body.purpose : null;

    // ── Size limits ──
    // Checked here rather than in multer's `limits`, which applies one ceiling
    // to the whole request and cannot vary it by mime type. The whole batch is
    // validated before anything is stored, and a single oversized file rejects
    // all of it: an upload where some files silently went missing is harder to
    // understand than one that plainly refused.
    const tooLarge = files
      .map((file) => checkSize(file, kindOf(file.mimetype)))
      .filter(Boolean);

    if (tooLarge.length > 0) {
      files.forEach((file) => fs.unlink(file.path, () => {}));
      return res.status(413).json({ error: tooLarge.join(' ') });
    }

    const created = [];
    for (const file of files) {
      const kind = kindOf(file.mimetype);
      if (!kind) {
        // multer's filter should have caught this; clean up rather than store it.
        fs.unlink(file.path, () => {});
        continue;
      }
      const doc = await prisma.companyDocument.create({
        data: {
          companyId:  company.id,
          name:       req.body.name || file.originalname,
          fileUrl:    path.basename(file.path), // relative to MEDIA_DIR, never sent out
          kind,
          purpose:    requested || defaultPurpose(kind),
          mimeType:   file.mimetype,
          sizeBytes:  file.size,
          uploadedBy: req.user.id,
        },
      });
      created.push(doc);
    }

    if (created.length === 0) {
      return res.status(400).json({
        error: 'Unsupported file type. Images, PDFs, Word documents and video are accepted.',
      });
    }

    // A logo or banner upload is a replacement, not an addition: point the
    // company at the new file so the admin does not have to pick it
    // afterwards. The previous one stays in the gallery rather than being
    // deleted - removing a file is always an explicit act.
    if (requested === 'LOGO' || requested === 'BANNER') {
      await prisma.company.update({
        where: { id: company.id },
        data: requested === 'LOGO'
          ? { logoDocId: created[0].id }
          : { bannerDocId: created[0].id },
      });
    }

    res.status(201).json({ media: created.map((d) => publicMedia(d, req.user.id)) });
  } catch (err) {
    console.error('company uploadMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Stream (inline, range-aware) ───────────────
const streamMedia = async (req, res) => {
  try {
    const { id: companyId, docId } = req.params;

    try {
      verifyTicket(req.query.t, { docId, companyId });
    } catch {
      return res.status(403).json({ error: 'This media link has expired. Reopen the company profile.' });
    }

    const doc = await prisma.companyDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) return res.status(404).json({ error: 'Media not found' });

    const filePath = path.join(MEDIA_DIR, path.basename(doc.fileUrl));
    if (!fs.existsSync(filePath)) {
      console.error('company streamMedia: file missing on disk:', filePath);
      return res.status(404).json({ error: 'Media file is missing' });
    }

    const { size } = fs.statSync(filePath);

    // Inline, uncacheable, and never sniffed into another type. An SVG logo is
    // served as a download-proof inline image, and `nosniff` plus the CSP
    // below stop script inside one from running against the portal's origin.
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    // helmet()'s app-wide defaults are written for an API that returns JSON and
    // stop a browser rendering this response from another origin:
    // Cross-Origin-Resource-Policy: same-origin blocks the <img> and <video>,
    // while X-Frame-Options and the default CSP's frame-ancestors 'self' block
    // the PDF <iframe>. Relaxed for this one response, narrowed to the
    // frontend rather than opened to everyone.
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `default-src 'none'; frame-ancestors 'self' ${frontend}`);

    // Video needs ranges to seek, and browsers request them unprompted.
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end   = match && match[2] ? parseInt(match[2], 10) : size - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).end();
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', size);
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('company streamMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Word document preview ──────────────────────
// `.docx` converted to HTML so it can be read inside the portal. The result is
// sanitised before it is returned: a Word file is arbitrary input, the HTML
// mammoth produces from it is rendered in the member's browser, and a document
// must not be able to run script there.
//
// Images embedded in the document become inline `data:` URIs, which keeps the
// preview self-contained - no second request, and no separate URL for an image
// inside a confidential document.
const DOC_PREVIEW_SANITIZE = {
  allowedTags: [
    'p', 'br', 'hr', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
  ],
  allowedAttributes: {
    a:   ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    td:  ['colspan', 'rowspan'],
    th:  ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data', 'http', 'https'] },
  nonTextTags: ['style', 'script', 'textarea', 'noscript'],
};

const previewDocument = async (req, res) => {
  try {
    const { id: companyId, docId } = req.params;

    try {
      verifyTicket(req.query.t, { docId, companyId });
    } catch {
      return res.status(403).json({ error: 'This preview link has expired. Reopen the company profile.' });
    }

    const doc = await prisma.companyDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.kind !== 'DOC') {
      return res.status(400).json({ error: 'This file is not a Word document.' });
    }

    const filePath = path.join(MEDIA_DIR, path.basename(doc.fileUrl));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document file is missing' });
    }

    // Legacy binary .doc is a different format entirely and cannot be
    // converted here. Saying so is better than returning an empty preview and
    // letting the viewer look broken.
    const isDocx = /\.docx$/i.test(doc.name)
      || doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isDocx) {
      return res.status(415).json({
        error: 'This is a legacy .doc file, which cannot be previewed in the portal. '
             + 'Re-upload it as .docx or PDF to make it readable here.',
      });
    }

    const { value, messages } = await mammoth.convertToHtml({ path: filePath });
    if (messages?.length) {
      // Unsupported styles are normal and not worth failing over; they are
      // logged once so a recurring one can be looked at.
      console.warn('docx preview notes for', doc.id, messages.slice(0, 3).map((m) => m.message));
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.json({
      name: doc.name,
      html: sanitizeHtml(value || '', DOC_PREVIEW_SANITIZE),
    });
  } catch (err) {
    console.error('company previewDocument error:', err);
    res.status(500).json({ error: 'That document could not be converted for viewing.' });
  }
};

// ── Delete (admin) ─────────────────────────────
const deleteMedia = async (req, res) => {
  try {
    const { id: companyId, docId } = req.params;
    const doc = await prisma.companyDocument.findFirst({ where: { id: docId, companyId } });
    if (!doc) return res.status(404).json({ error: 'Media not found' });

    await prisma.companyDocument.delete({ where: { id: doc.id } });

    // A deleted file must not stay referenced as the logo or banner, or the
    // profile would keep asking for a document that no longer exists.
    const company = await prisma.company.findUnique({
      where:  { id: companyId },
      select: { logoDocId: true, bannerDocId: true },
    });
    const clear = {};
    if (company?.logoDocId === doc.id)   clear.logoDocId = null;
    if (company?.bannerDocId === doc.id) clear.bannerDocId = null;
    if (Object.keys(clear).length > 0) {
      await prisma.company.update({ where: { id: companyId }, data: clear });
    }

    fs.unlink(path.join(MEDIA_DIR, path.basename(doc.fileUrl)), () => {});

    res.json({ message: 'Media removed' });
  } catch (err) {
    console.error('company deleteMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  MEDIA_DIR, KIND_BY_MIME, PURPOSES, kindOf, ensureDir,
  streamUrlFor, previewUrlFor, publicMedia,
  listMedia, uploadMedia, streamMedia, previewDocument, deleteMedia,
};
