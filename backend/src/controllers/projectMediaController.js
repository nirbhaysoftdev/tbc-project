// src/controllers/projectMediaController.js
//
// Deal-room media: images, PDFs and video attached to a project, uploaded by an
// admin and viewable in-page by members.
//
// Members must be able to view this material but not download it, so the bytes
// never become a plain URL:
//
//   - files live in backend/storage/project-media, which is NOT under the
//     public /uploads static mount, so there is no path that serves them
//     directly;
//   - the stored path is never returned to a client;
//   - a listing hands back a short-lived, single-document ticket, and only the
//     streaming endpoint below will trade that ticket for bytes;
//   - the stream always sends Content-Disposition: inline, so a browser renders
//     it rather than offering to save it.
//
// This removes every download affordance and stops a link being shared or
// bookmarked. It cannot make the bytes unreachable: anything a browser can
// display, a determined viewer can still capture from the network tab or the
// screen. Treat it as "no download button anywhere", not as DRM.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');
const { checkSize } = require('../services/uploadLimits');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'storage', 'project-media');
const TICKET_TTL_SECONDS = 60 * 60; // long enough to watch a video through

// What may be uploaded, and which viewer each one gets on the client.
const KIND_BY_MIME = {
  'image/jpeg': 'IMAGE',
  'image/png':  'IMAGE',
  'image/webp': 'IMAGE',
  'image/gif':  'IMAGE',
  'application/pdf': 'PDF',
  'video/mp4':  'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
};

const kindOf = (mime) => KIND_BY_MIME[String(mime).toLowerCase()] || null;

function ensureDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// ── Tickets ────────────────────────────────────
// Scoped to one document for one viewer, so it cannot be reused to reach other
// media and expires on its own. The session JWT deliberately never goes in a
// URL, where it would leak through logs and referrers.
function signTicket({ docId, projectId, userId }) {
  return jwt.sign(
    { purpose: 'project-media', docId, projectId, userId },
    process.env.JWT_SECRET,
    { expiresIn: TICKET_TTL_SECONDS },
  );
}

function verifyTicket(token, { docId, projectId }) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'project-media') throw new Error('wrong ticket purpose');
  if (payload.docId !== docId || payload.projectId !== projectId) throw new Error('ticket scope mismatch');
  return payload;
}

/**
 * The viewable URL for one document, ticket included.
 *
 * Exported because the project payloads need it too: a project's banner image
 * is one of its documents, and the listing has to be able to render it without
 * a second round trip per card.
 */
function streamUrlFor({ projectId, docId, userId }) {
  return `/projects/${projectId}/media/${docId}/stream`
    + `?t=${signTicket({ docId, projectId, userId })}`;
}

/** The shape a client is allowed to see - never the stored path. */
function publicMedia(doc, req) {
  return {
    id:         doc.id,
    name:       doc.name,
    type:       doc.type,
    kind:       doc.kind,
    mimeType:   doc.mimeType,
    sizeBytes:  doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
    streamUrl:  streamUrlFor({ projectId: doc.projectId, docId: doc.id, userId: req.user.id }),
  };
}

// ── List a project's media ─────────────────────
const listMedia = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const documents = await prisma.projectDocument.findMany({
      where:   { projectId: project.id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ media: documents.map((d) => publicMedia(d, req)) });
  } catch (err) {
    console.error('listMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Upload (admin) ─────────────────────────────
const uploadMedia = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded. Images, PDFs and video are accepted.' });
    }

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
      const doc = await prisma.projectDocument.create({
        data: {
          projectId:  project.id,
          name:       req.body.name || file.originalname,
          fileUrl:    path.basename(file.path), // relative to MEDIA_DIR, never sent out
          type:       req.body.type || 'OTHER',
          kind,
          mimeType:   file.mimetype,
          sizeBytes:  file.size,
          uploadedBy: req.user.id,
        },
      });
      created.push(doc);
    }

    if (created.length === 0) {
      return res.status(400).json({ error: 'Unsupported file type. Images, PDFs and video are accepted.' });
    }

    res.status(201).json({ media: created.map((d) => publicMedia(d, req)) });
  } catch (err) {
    console.error('uploadMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Stream (inline, range-aware) ───────────────
const streamMedia = async (req, res) => {
  try {
    const { id: projectId, docId } = req.params;

    try {
      verifyTicket(req.query.t, { docId, projectId });
    } catch {
      return res.status(403).json({ error: 'This media link has expired. Reopen the project.' });
    }

    const doc = await prisma.projectDocument.findFirst({
      where: { id: docId, projectId },
    });
    if (!doc) return res.status(404).json({ error: 'Media not found' });

    const filePath = path.join(MEDIA_DIR, path.basename(doc.fileUrl));
    if (!fs.existsSync(filePath)) {
      console.error('streamMedia: file missing on disk:', filePath);
      return res.status(404).json({ error: 'Media file is missing' });
    }

    const { size } = fs.statSync(filePath);

    // Inline, uncacheable, and never sniffed into another type.
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    // helmet()'s app-wide defaults are written for an API that returns JSON,
    // and they stop a browser rendering this response from another origin:
    // Cross-Origin-Resource-Policy: same-origin blocks the <img> and <video>,
    // while X-Frame-Options and the default CSP's frame-ancestors 'self' block
    // the PDF <iframe>. Relax both for this one response, narrowed to the
    // frontend rather than opened to everyone.
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontend}`);

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
    console.error('streamMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete (admin) ─────────────────────────────
const deleteMedia = async (req, res) => {
  try {
    const { id: projectId, docId } = req.params;
    const doc = await prisma.projectDocument.findFirst({ where: { id: docId, projectId } });
    if (!doc) return res.status(404).json({ error: 'Media not found' });

    await prisma.projectDocument.delete({ where: { id: doc.id } });
    fs.unlink(path.join(MEDIA_DIR, path.basename(doc.fileUrl)), () => {});

    res.json({ message: 'Media removed' });
  } catch (err) {
    console.error('deleteMedia error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  MEDIA_DIR, KIND_BY_MIME, kindOf, ensureDir, streamUrlFor, publicMedia,
  listMedia, uploadMedia, streamMedia, deleteMedia,
};
