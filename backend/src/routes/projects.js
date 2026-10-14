// src/routes/projects.js
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');
const { MAX_ANY } = require('../services/uploadLimits');
const router  = express.Router();
const { authenticate, requireAdmin, requireActive } = require('../middleware/auth');
const ctrl = require('../controllers/projectsController');
const requestCtrl = require('../controllers/investmentRequestController');
const mediaCtrl = require('../controllers/projectMediaController');

// ── Deal-room media streaming ─────────────────
// Declared before the session middleware below: an <img>, <video> or <iframe>
// cannot send an Authorization header, so these requests authenticate with the
// short-lived, per-document ticket in the query string instead. See
// projectMediaController.
router.get('/:id/media/:docId/stream', mediaCtrl.streamMedia);

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

router.get('/:id/media',                      mediaCtrl.listMedia);
router.post('/:id/media',    requireAdmin,    mediaUpload.array('files', 20), mediaCtrl.uploadMedia);
router.delete('/:id/media/:docId', requireAdmin, mediaCtrl.deleteMedia);

router.get('/my-investments',              ctrl.getMyInvestments);
router.get('/my-investment-requests',      requestCtrl.getMyRequests);
// Both of these must stay above '/:id', or Express matches "facets" and
// "people" as project ids.
router.get('/facets',                      ctrl.getFacets);
router.get('/people/search', requireAdmin, ctrl.searchPeople);
router.get('/',                            ctrl.getProjects);
router.get('/:id',                         ctrl.getProject);
router.post('/',        requireAdmin,      ctrl.createProject);
router.put('/:id',      requireAdmin,      ctrl.updateProject);
router.delete('/:id',   requireAdmin,      ctrl.deleteProject);
// "Invest Now" raises a request - it never moves money on its own.
router.post('/:id/invest',                 ctrl.invest);
router.put('/investment-requests/:id/cancel', requestCtrl.cancelRequest);
router.post('/:id/milestones', requireAdmin, ctrl.addMilestone);

module.exports = router;
