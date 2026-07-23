// src/routes/auth.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// ── Multer setup for signup file uploads ─────────────
const signupDir = path.join(__dirname, '../../uploads/signup');
if (!fs.existsSync(signupDir)) fs.mkdirSync(signupDir, { recursive: true });

const signupStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, signupDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = file.fieldname.replace(/[^a-z0-9]/gi, '');
    cb(null, `${safe}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const signupUpload = multer({
  storage: signupStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|webp|doc|docx/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
});

// Rate limit sensitive endpoints
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

// POST /api/auth/register  (multipart/form-data — CV, resident ID, trade license)
router.post(
  '/register',
  signupUpload.fields([
    { name: 'cv',              maxCount: 1 },
    { name: 'residentIdFile',  maxCount: 1 },
    { name: 'tradeLicense',    maxCount: 1 },
  ]),
  [
    body('name').trim().isLength({ min: 2, max: 80 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('accountType').isIn(['PROFESSIONAL', 'BUSINESS']),
  ],
  authController.register,
);

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, authController.sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', otpLimiter, authController.verifyOtp);

// POST /api/auth/google
router.post('/google', authController.googleAuth);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  authController.login,
);

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout);

// GET /api/auth/me
router.get('/me', authenticate, authController.me);

module.exports = router;
