// src/routes/profile.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const prisma = require('../utils/prismaClient');
const { authenticate } = require('../middleware/auth');
const { normalizeLanguage } = require('../services/i18n/languages');

const bcrypt  = require('bcryptjs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.put('/', authenticate, upload.single('photo'), async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const profilePhoto = req.file ? `/uploads/${req.file.filename}` : undefined;
    const updateData   = {};

    if (name) updateData.name = name;
    if (profilePhoto) updateData.profilePhoto = profilePhoto;

    if (newPassword && currentPassword) {
      const user  = await prisma.user.findUnique({ where: { id: req.user.id } });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const user = await prisma.user.update({
      where:  { id: req.user.id },
      data:   updateData,
      select: { id: true, name: true, email: true, profilePhoto: true, role: true },
    });

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PATCH /api/profile/language
 *
 * Saves the signed-in member's UI language so it follows them to another
 * device (requirement §5 "restore the saved preference across devices").
 *
 * It lives on the existing profile resource rather than a new endpoint because
 * it is one more field on the caller's own record, and PUT /profile already
 * owns that record (§8 "do not create redundant endpoints").
 *
 * Deliberately narrow:
 *   - it can only ever write the caller's own row; there is no :id
 *   - the value is validated against the allowlist, so an arbitrary string can
 *     never reach the column
 *   - a two-letter language code is not sensitive data (§5), and nothing else
 *     about the user is read or returned
 */
router.patch('/language', authenticate, async (req, res) => {
  try {
    const locale = normalizeLanguage(req.body?.locale);
    if (!locale) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const user = await prisma.user.update({
      where:  { id: req.user.id },
      data:   { locale },
      select: { id: true, locale: true },
    });

    res.json({ locale: user.locale });
  } catch (err) {
    console.error('[i18n] could not save language preference:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
