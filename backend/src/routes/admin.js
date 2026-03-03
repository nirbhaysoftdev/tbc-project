// src/routes/admin.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

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

router.use(authenticate, requireAdmin);

// Members
router.get('/members',              adminController.getMembers);
router.post('/members',             upload.single('photo'), adminController.createMember);
router.put('/members/:id',          upload.single('photo'), adminController.updateMember);
router.delete('/members/:id',       adminController.deleteMember);
router.put('/members/:id/freeze',   adminController.toggleFreeze);

// Wallet management
router.put('/members/:id/wallet',   adminController.updateWallet);

// Transactions
router.post('/transactions',        adminController.addTransaction);

// Stats
router.get('/stats',                adminController.getStats);
router.get('/export',               adminController.exportData);

module.exports = router;
