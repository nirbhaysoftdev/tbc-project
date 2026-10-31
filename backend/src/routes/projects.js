// src/routes/projects.js
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');
const { MAX_ANY } = require('../services/uploadLimits');
const router  = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin, requireActive } = require('../middleware/auth');
const ctrl = require('../controllers/projectsController');
const requestCtrl = require('../controllers/investmentRequestController');
const mediaCtrl = require('../controllers/projectMediaController');
const lifecycleCtrl = require('../controllers/projectAnnouncementController');

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
// Irreversible, and the Investment / Transaction / milestone foreign keys are
// Restrict — see superAdminController.forceDeleteProject for the forced path.
router.delete('/:id',   requireSuperAdmin, ctrl.deleteProject);
// "Invest Now" raises a request - it never moves money on its own.
router.post('/:id/invest',                 ctrl.invest);
router.put('/investment-requests/:id/cancel', requestCtrl.cancelRequest);
router.post('/:id/milestones', requireAdmin, ctrl.addMilestone);

// ── Project lifecycle: launch & announcements ─
// All admin-only on the server. The lifecycle panel hides the buttons a
// project is not eligible for, but every endpoint re-checks the role AND the
// project's launch state before acting - see projectAnnouncementController.
//
// Declared after '/:id' because each one has its own suffix, so none of them
// can be swallowed by the bare id route.
router.get('/:id/announcements',  requireAdmin, lifecycleCtrl.getHistory);
// The recipient picker's list: every member this project's announcement could
// reach. Admin only - it carries names and email addresses, which no
// member-facing payload is allowed to include.
router.get('/:id/announcements/audience', requireAdmin, lifecycleCtrl.getAudience);
// Launching is a one-time, irreversible, community-wide act: it has its own
// endpoint rather than being a status change through PUT /:id, so an ordinary
// edit can never trigger it (§4).
router.post('/:id/launch',        requireAdmin, lifecycleCtrl.launchProject);
// The review workflow for projects that were already published when this
// module arrived (§8). Sends nothing.
router.post('/:id/launch-classify', requireAdmin, lifecycleCtrl.classifyLaunch);
// The ONE way to communicate about a project after it has launched. There is
// deliberately no plain "re-announce" endpoint: an announcement has to have
// something to say, so the summary is required.
router.post('/:id/announcements/major-update', requireAdmin, lifecycleCtrl.majorUpdate);
// Separate from both editing and announcing, and confirmed on its own (§7).
router.post('/:id/promo-restart', requireAdmin, lifecycleCtrl.restartPromo);
router.post('/:id/announcements/:announcementId/retry', requireAdmin, lifecycleCtrl.retryAnnouncement);

module.exports = router;
