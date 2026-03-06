// src/routes/profile.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const prisma = require('../utils/prismaClient');
const { authenticate } = require('../middleware/auth');

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

module.exports = router;
