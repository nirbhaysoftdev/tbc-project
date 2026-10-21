// src/routes/admin.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const memberOverviewController = require('../controllers/memberOverviewController');
const activityLogController = require('../controllers/activityLogController');
const signupNotifyController = require('../controllers/signupNotifyController');

// Multer config for profile photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    cb(null, allowed.test(file.mimetype));
  },
});

// Multer config for optional KYC documents uploaded during activation
const kycDir = path.join(__dirname, '../../uploads/kyc');
if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, kycDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `kyc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const docUpload = multer({
  storage: docStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) || allowed.test(file.mimetype);
    cb(null, ok);
  },
});

// Multer config for member creation (photo + identity/company documents)
const memberUpload = multer({
  storage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) || allowed.test(file.mimetype);
    cb(null, ok);
  },
});

router.use(authenticate, requireAdmin);

// Everything below is open to ADMIN unless it carries requireSuperAdmin.
// The split: an admin runs the day-to-day portal, a super admin holds the
// irreversible actions (deletion, rejection, freezing, credential changes)
// and the two money levers that leave no ledger entry behind them — wallet
// opening balances and withdrawal decisions. See routes/superAdmin.js.

// ── MMS - Pending applicants & approval ──────────
router.get('/pending',              adminController.getPendingUsers);
router.post('/users/:id/approve',   docUpload.array('documents', 5), adminController.approveUser);
// Terminal: REJECTED blocks login for good.
router.post('/users/:id/reject',    requireSuperAdmin, adminController.rejectUser);

// Members
router.get('/members',              adminController.getMembers);
// Full money picture for one member (detail page) + the statement email it sends
router.get('/members/:id/overview',       memberOverviewController.getMemberOverview);
router.post('/members/:id/send-statement', memberOverviewController.sendMemberStatement);
router.post(
  '/members',
  memberUpload.fields([
    { name: 'photo',        maxCount: 1 },
    { name: 'tradeLicense', maxCount: 1 },
    { name: 'passport',     maxCount: 1 },
    { name: 'residentId',   maxCount: 1 },
  ]),
  adminController.createMember,
);
router.put('/members/:id',          upload.single('photo'), adminController.updateMember);
router.delete('/members/:id',       requireSuperAdmin, adminController.deleteMember);
router.put('/members/:id/freeze',   requireSuperAdmin, adminController.toggleFreeze);

// Wallet management
// Two separate powers that used to be one call. Switching a member's wallet on
// is routine admin work; writing an opening balance overwrites a number with
// no Transaction row to explain it, so it is super-admin only.
router.put('/members/:id/wallet-enabled', adminController.setWalletEnabled);
router.put('/members/:id/wallet',   requireSuperAdmin, adminController.updateWallet);

// Transactions
router.post('/transactions',        adminController.addTransaction);

// Stats
router.get('/stats',                adminController.getStats);
// Pending-action counts behind the notification badge
router.get('/notifications',        adminController.getNotificationCounts);

// ── New-signup notification recipients ───────────
// Any admin may see where application alerts go; only a super admin may
// redirect them, because an admin who could point them at their own mailbox
// would be able to approve an applicant with nobody else told.
router.get('/signup-notify',        signupNotifyController.getRecipients);
router.put('/signup-notify',        requireSuperAdmin, signupNotifyController.updateRecipients);

// ── Activity logs ────────────────────────────────
// /types is declared before the list route only for readability; they do not
// collide (different paths).
router.get('/logs/types',           activityLogController.listLogTypes);
router.get('/logs',                 activityLogController.listLogs);
// Bulk PII in a single response.
router.get('/export',               requireSuperAdmin, adminController.exportData);

module.exports = router;
