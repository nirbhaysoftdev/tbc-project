// src/routes/uploads.js
//
// Replaces the old `express.static('/uploads')` mount, which served every
// uploaded file to anyone holding (or guessing) the URL — including passports,
// resident IDs, trade licences and CVs.
//
// Each request is now classified against the database:
//   PUBLIC  -> profile photos only, the one deliberate exception
//   MEMBER  -> content imagery: any active logged-in member
//   DOC     -> identity/KYC documents: the owner or an admin only
//   UNKNOWN -> 404, so orphaned files cannot be enumerated
//
// MEMBER and DOC both accept either a Bearer token or a short-lived signed
// ?token= link, because an <img>, <video> or <a> cannot send a header.
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');
const {
  resolveUploadPath, classifyStoredUrl, canReadDoc, canReadMemberFile, verifyFileToken,
} = require('../services/fileAccess');

const router = express.Router();

/** Resolve the caller from a Bearer header, or null. Never throws. */
async function userFromBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    return await prisma.user.findUnique({
      where:  { id: decoded.userId },
      select: { id: true, role: true, status: true },
    });
  } catch {
    return null;
  }
}

router.get('/*', async (req, res) => {
  // req.params[0] is the path under /uploads, e.g. "signup/cv-123.pdf"
  const rel = req.params[0] || '';
  const abs = resolveUploadPath(rel);
  if (!abs) return res.status(400).json({ error: 'Invalid path' });

  // The database stores paths in this exact shape.
  const storedUrl = `/uploads/${rel}`;
  const { kind, ownerId } = await classifyStoredUrl(storedUrl);

  if (kind === 'UNKNOWN') {
    // Not referenced anywhere - behave as if it does not exist.
    return res.status(404).json({ error: 'Not found' });
  }

  if (kind === 'DOC' || kind === 'MEMBER') {
    // Resolve the caller from a signed link for this exact file, or from a
    // normal Bearer session.
    const signed = req.query.token ? verifyFileToken(String(req.query.token), storedUrl) : null;
    const caller = signed
      ? await prisma.user.findUnique({
          where:  { id: signed.sub },
          select: { id: true, role: true, status: true },
        })
      : await userFromBearer(req);

    const allowed = kind === 'DOC'
      ? canReadDoc(caller, ownerId)
      : canReadMemberFile(caller);

    if (!allowed) {
      return res.status(403).json({
        error: kind === 'DOC'
          ? 'Not authorized to view this document'
          : 'Sign in to view this file',
      });
    }

    // Nothing private may sit in a proxy or shared cache.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  }

  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });

  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = router;
