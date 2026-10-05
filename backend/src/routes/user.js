// src/routes/user.js
// MMS onboarding: profile completion and KYC document upload
const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { authenticate } = require('../middleware/auth');
const userController   = require('../controllers/userController');

// Ensure KYC upload directory exists
const kycDir = path.join(__dirname, '../../uploads/kyc');
if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });

const kycStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, kycDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `kyc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const kycUpload = multer({
  storage: kycStorage,
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) ||
               allowed.test(file.mimetype);
    cb(null, ok);
  },
});

// All routes require authentication (user can be PENDING during onboarding)
router.use(authenticate);

// POST /api/user/profile  - profile completion step
router.post('/profile', userController.submitProfile);

// POST /api/user/kyc      - KYC document upload (up to 5 files)
router.post('/kyc', kycUpload.array('documents', 5), userController.submitKyc);

// GET  /api/user/kyc      - get KYC status + document list
router.get('/kyc', userController.getKycStatus);

// GET  /api/user/kpi      - get KPI summary for current user
router.get('/kpi', userController.getKpi);

module.exports = router;
