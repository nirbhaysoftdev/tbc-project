// src/routes/companies.js
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');
const { MAX_ANY } = require('../services/uploadLimits');
const router  = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin, requireActive } = require('../middleware/auth');
const ctrl = require('../controllers/companiesController');
const mediaCtrl = require('../controllers/companyMediaController');

// ── Media streaming and document previews ─────
// Declared before the session middleware below: an <img>, <video> or <iframe>
// cannot send an Authorization header, so these requests authenticate with the
// short-lived, per-document ticket in the query string instead. See
// companyMediaController.
//
// The .docx preview sits here too. It is fetched by the viewer rather than
// framed, so it could carry the session header, but keeping both on the same
// ticket means one rule to reason about and no second way to reach a file.
router.get('/:id/media/:docId/stream',  mediaCtrl.streamMedia);
router.get('/:id/media/:docId/preview', mediaCtrl.previewDocument);

router.use(authenticate, requireActive);

// ── Media uploads (admin) ─────────────────────
mediaCtrl.ensureDir();

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, mediaCtrl.MEDIA_DIR),
  filename:    (_req, file, cb) => {
    // Stored name is random: it is never shown and never guessable.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const mediaUpload = multer({
  storage: mediaStorage,
  // The outer ceiling only. Multer applies one limit to the whole request
  // and cannot vary it by mime type, so the per-kind caps — documents 8 MB —
  // are enforced in the controller once the file's kind is known.
  // See services/uploadLimits.js.
  limits:  { fileSize: MAX_ANY },
  fileFilter: (_req, file, cb) => cb(null, Boolean(mediaCtrl.kindOf(file.mimetype))),
});

router.get('/:id/media',                         mediaCtrl.listMedia);
router.post('/:id/media',      requireAdmin,     mediaUpload.array('files', 20), mediaCtrl.uploadMedia);
router.delete('/:id/media/:docId', requireAdmin, mediaCtrl.deleteMedia);

// Above '/:id', or Express matches "facets" as a company id.
router.get('/facets',                 ctrl.getFacets);
router.get('/',                       ctrl.getCompanies);
router.get('/:id',                    ctrl.getCompany);
router.post('/',    requireAdmin,     ctrl.createCompany);
router.put('/:id',  requireAdmin,     ctrl.updateCompany);
router.delete('/:id', requireSuperAdmin, ctrl.deleteCompany);

module.exports = router;
