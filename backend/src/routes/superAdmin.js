// src/routes/superAdmin.js
//
// Mounted at /api/super-admin. Every route below sits behind one
// `router.use(authenticate, requireSuperAdmin)`, so the gate is structural
// rather than repeated per route — there is no way to add an endpoint here and
// forget to protect it. That is the reason this is a separate file from
// routes/admin.js instead of a section inside it.
//
// The one exception is the impersonation status check, which has to be
// reachable while holding an impersonation token. It is declared above the
// gate and is a GET that reveals nothing beyond what the holder already has.

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ctrl   = require('../controllers/superAdminController');
const assets = require('../controllers/superAdminAssetsController');
const apiKeys = require('../controllers/apiKeyController');
const zohoCtrl = require('../controllers/zohoController');
const reports = require('../controllers/reportsController');
const txAdjust = require('../controllers/transactionAdjustController');
const insuranceCtrl = require('../controllers/insuranceController');
const cardCtrl = require('../controllers/memberCardController');
const { limitFor } = require('../services/uploadLimits');

// ── Impersonation status ──────────────────────
// Above the gate: the caller is holding a member's impersonation token, so
// requireSuperAdmin would reject it (by design — see middleware/auth.js).
router.get('/impersonation/status', authenticate, ctrl.impersonationStatus);

router.use(authenticate, requireSuperAdmin);

// ── Uploads ───────────────────────────────────
// Identity documents go to uploads/ and are authorised per request by
// services/fileAccess.js, which classifies them DOC: readable by the owner or
// an admin and nobody else. They must never go to storage/*-media, which any
// member who can open the project or company page can stream.
const kycDir = path.join(__dirname, '../../uploads/kyc');
if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });

const ALLOWED_DOC = /jpeg|jpg|png|webp|pdf/;

function docFilter(_req, file, cb) {
  const ok = ALLOWED_DOC.test(path.extname(file.originalname).toLowerCase())
          || ALLOWED_DOC.test(file.mimetype);
  cb(null, ok);
}

const makeStorage = (dir, prefix) => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

// The 8MB document ceiling comes from services/uploadLimits.js, which
// frontend/src/lib/uploadLimits.ts mirrors. Do not hardcode a number here —
// the two sides have to move together.
const DOC_MAX = limitFor('PDF');
const identityUpload = multer({
  storage: makeStorage('uploads/', 'doc'),
  limits:  { fileSize: DOC_MAX },
  fileFilter: docFilter,
});

const kycUpload = multer({
  storage: makeStorage(kycDir, 'kyc'),
  limits:  { fileSize: DOC_MAX },
  fileFilter: docFilter,
});

const photoUpload = multer({
  storage: makeStorage('uploads/', 'photo'),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /jpeg|jpg|png|webp/.test(file.mimetype)),
});

// ── Users ─────────────────────────────────────
// Unlike /admin/members, this list is not limited to role MEMBER: managing
// admins is the point.
router.get('/users',            ctrl.listUsers);
router.get('/users/:id',        ctrl.getUser);
router.put('/users/:id',        photoUpload.single('photo'), ctrl.updateUser);

// Credentials and role each have their own endpoint so they are logged and
// notified separately from an ordinary record edit.
router.put('/users/:id/email',          ctrl.changeEmail);
router.post('/users/:id/reset-password', ctrl.resetPassword);
router.put('/users/:id/role',           ctrl.setRole);

// Recoverable by default. The purge is the one that is not, and it demands the
// member's email echoed back in `confirm`.
router.delete('/users/:id',         ctrl.softDeleteUser);
router.post('/users/:id/restore',   ctrl.restoreUser);
router.post('/users/:id/purge',     ctrl.purgeUser);

// Read-only and audited; the middleware blocks every write made with the token.
router.post('/users/:id/impersonate', ctrl.impersonate);

// ── Identity documents ────────────────────────
// :kind is passport | residentId | tradeLicense | cv — the four Profile
// columns already registered in the DOC branch of classifyStoredUrl.
router.post('/users/:id/documents/:kind',
  identityUpload.single('file'), assets.uploadDocument);
router.delete('/users/:id/documents/:kind', assets.deleteDocument);

router.post('/users/:id/kyc-documents',
  kycUpload.single('file'), assets.addKycDocument);
router.put('/users/:id/kyc-documents/:docId',    assets.reviewKycDocument);
router.delete('/users/:id/kyc-documents/:docId', assets.deleteKycDocument);

// ── Projects and companies ────────────────────
// The manifest says what a forced delete would destroy. Ask for it first; the
// delete itself needs the project title echoed back in `confirm`.
router.get('/projects/:id/delete-manifest', assets.getProjectDeleteManifest);
router.post('/projects/:id/force-delete',   assets.forceDeleteProject);
router.put('/projects/:id/transfer',        assets.transferProject);
router.put('/companies/:id/transfer',       assets.transferCompany);

// ── Content ───────────────────────────────────
router.delete('/posts/:id',     assets.deletePost);
router.delete('/comments/:id',  assets.deleteComment);
router.delete('/enquiries/:id', assets.deleteEnquiry);

// ── Ledger ────────────────────────────────────
// Books the mirror-image entry. No endpoint anywhere edits a balance directly.
router.post('/transactions/:id/reverse', assets.reverseTransaction);
// Correct a transaction's amount/date, or undo it (source record moves with it).
router.put('/transactions/:id',         txAdjust.edit);
router.post('/transactions/:id/undo',   txAdjust.undo);

router.patch('/investments/:id/note', assets.setInvestmentNote);

// ── API keys ──────────────────────────────────
// Machine credentials for the read-only API (services/apiKeys.js). Super admin
// only, like everything else in this file: a key is a standing grant to read
// member data without a session, so issuing one is not an ADMIN-level action.
//
// `create` and `rotate` are the only two places a key is ever readable, and
// only in their own response. There is deliberately no GET that returns one.
// ── Zoho Books ────────────────────────────────
// Connection settings (secrets are write-only), a connection test, and the
// receipt queue. Super admin only, like everything in this file.
router.get('/zoho',                  zohoCtrl.getSettings);
router.put('/zoho',                  zohoCtrl.updateSettings);
router.post('/zoho/test',            zohoCtrl.testConnection);
router.post('/zoho/exchange-code',   zohoCtrl.exchangeCode);
router.get('/zoho/accounts',         zohoCtrl.listAccounts);
router.get('/zoho/receipts',         zohoCtrl.listReceipts);
router.post('/zoho/receipts/retry-dead', zohoCtrl.retryDead);
router.post('/zoho/customers/sync',  zohoCtrl.syncCustomers);
router.get('/zoho/members',         zohoCtrl.listMembers);
router.put('/zoho/members/:id',     zohoCtrl.setMemberZoho);
router.post('/zoho/invoices/send-drafts', zohoCtrl.sendDrafts);

router.get('/api-keys',             apiKeys.listKeys);
router.post('/api-keys',            apiKeys.createKey);
router.put('/api-keys/:id',         apiKeys.updateKey);
// Additive: the old key keeps working until it is revoked, so a consumer can
// deploy the new one without a window where neither is right.
router.post('/api-keys/:id/rotate', apiKeys.rotateKey);
// Revoke, not delete - the row is the record of what the key could reach.
router.delete('/api-keys/:id',      apiKeys.revokeKey);

// ── Insurance ─────────────────────────────────
// The full policy list, and the only place a policy can be changed or switched off.
router.get('/insurance',          insuranceCtrl.list);
router.put('/insurance/:userId',  insuranceCtrl.update);

// ── Membership cards ──────────────────────────
// Assigning and editing is super admin only; the member can only read their own.
router.get('/cards',                   cardCtrl.list);
router.put('/cards/:userId',           cardCtrl.upsert);
router.put('/cards/:userId/enabled',   cardCtrl.setEnabled);

// ── Reports ───────────────────────────────────
// Full member financials (emails, balances, fix %), so super admin only. The
// settings and send-now routes are declared before /:key so they are not read
// as a report named "settings".
router.get('/reports',                 reports.catalogue);
router.get('/reports/settings',        reports.getRecipients);
router.put('/reports/settings',        reports.updateRecipients);
router.post('/reports/monthly/send-now', reports.sendNow);
router.get('/reports/:key',            reports.run);

module.exports = router;
