// src/routes/files.js
// Mints short-lived links for private documents, so an <a href> or a new tab
// can open one without the Bearer token the browser cannot attach itself.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  classifyStoredUrl, canReadDoc, canReadMemberFile, signFileToken, LINK_TTL_SECONDS,
} = require('../services/fileAccess');

const router = express.Router();

// GET /api/files/sign?path=/uploads/signup/cv-123.pdf
router.get('/sign', authenticate, async (req, res) => {
  try {
    const storedUrl = String(req.query.path || '');
    if (!storedUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'path must be an /uploads/... URL' });
    }

    const { kind, ownerId } = await classifyStoredUrl(storedUrl);
    if (kind === 'UNKNOWN') return res.status(404).json({ error: 'Not found' });

    // A profile photo needs no token; hand back the plain path so callers can
    // treat every file the same way.
    if (kind === 'PUBLIC') {
      return res.json({ url: storedUrl, expiresIn: null });
    }

    const allowed = kind === 'DOC'
      ? canReadDoc(req.user, ownerId)
      : canReadMemberFile(req.user);

    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to view this file' });
    }

    const token = signFileToken(storedUrl, req.user.id);
    res.json({
      url:       `${storedUrl}?token=${encodeURIComponent(token)}`,
      expiresIn: LINK_TTL_SECONDS,
    });
  } catch (err) {
    console.error('sign file error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
