// src/routes/system.js
// Public GET — returns dev notice text from DB.
// Frontend fetches this on every page load.
// Hiding/removing HTML elements won't remove this — it's always fresh from DB.

const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const prisma = require('../utils/prismaClient'); // Prisma 7 — uses adapter-pg singleton

// ── GET /api/system/notice — public, no auth needed ──
router.get('/notice', async (req, res) => {
  try {
    const record = await prisma.systemConfig.findUnique({
      where: { key: 'dev_notice' },
    });
    res.json({
      text:    record?.value || '',
      enabled: !!record?.value,
    });
  } catch (err) {
    console.error('System notice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/system/notice — admin only, update the text ──
router.put('/notice', authenticate, requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    const record = await prisma.systemConfig.upsert({
      where:  { key: 'dev_notice' },
      update: { value: text },
      create: { key: 'dev_notice', value: text },
    });
    res.json({ text: record.value });
  } catch (err) {
    console.error('System notice update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
