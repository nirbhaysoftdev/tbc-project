// src/controllers/userController.js
// Handles the MMS onboarding steps: profile completion and KYC document upload.
const prisma = require('../utils/prismaClient');

// ── POST /api/user/profile ────────────────────────────────────────────────────
// Saves / updates profile details during onboarding.
const submitProfile = async (req, res) => {
  const {
    bio, company, industry, country, city,
    phone, linkedIn, website, jobTitle, experienceYears,
    interests, // comma-separated string OR JSON array
  } = req.body;

  if (!company && !jobTitle && !bio) {
    return res.status(400).json({ error: 'Please provide at least company, job title, or bio.' });
  }

  try {
    // Parse interests
    let parsedInterests = [];
    if (interests) {
      try {
        parsedInterests = Array.isArray(interests)
          ? interests
          : JSON.parse(interests);
      } catch {
        parsedInterests = interests.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const profile = await prisma.profile.upsert({
      where:  { userId: req.user.id },
      update: {
        bio:            bio            || undefined,
        company:        company        || undefined,
        industry:       industry       || undefined,
        country:        country        || undefined,
        city:           city           || undefined,
        phone:          phone          || undefined,
        linkedIn:       linkedIn       || undefined,
        website:        website        || undefined,
        jobTitle:       jobTitle       || undefined,
        experienceYears: experienceYears ? parseInt(experienceYears, 10) : undefined,
        interests:      parsedInterests.length ? parsedInterests : undefined,
      },
      create: {
        userId:         req.user.id,
        bio:            bio            || null,
        company:        company        || null,
        industry:       industry       || null,
        country:        country        || null,
        city:           city           || null,
        phone:          phone          || null,
        linkedIn:       linkedIn       || null,
        website:        website        || null,
        jobTitle:       jobTitle       || null,
        experienceYears: experienceYears ? parseInt(experienceYears, 10) : null,
        interests:      parsedInterests,
      },
    });

    res.json({ profile, message: 'Profile saved. Please upload your KYC documents.' });
  } catch (err) {
    console.error('submitProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/user/kyc ────────────────────────────────────────────────────────
// Accepts one or more documents and sets kycStatus = PENDING (submitted).
const submitKyc = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one document.' });
    }

    const { documentTypes } = req.body;
    // documentTypes: JSON array matching the files array (e.g. ["id_proof","business_proof"])
    let types = [];
    try {
      types = documentTypes ? JSON.parse(documentTypes) : [];
    } catch {
      types = [];
    }

    const docs = req.files.map((file, i) => ({
      userId:       req.user.id,
      documentType: types[i] || 'id_proof',
      documentUrl:  `/uploads/kyc/${file.filename}`,
      status:       'pending',
    }));

    await prisma.$transaction([
      // Remove old pending docs for this user (re-upload scenario)
      prisma.kycDocument.deleteMany({
        where: { userId: req.user.id, status: 'pending' },
      }),
      prisma.kycDocument.createMany({ data: docs }),
      prisma.user.update({
        where: { id: req.user.id },
        data:  { kycStatus: 'PENDING' },
      }),
    ]);

    res.json({
      message: 'KYC documents submitted successfully. Your application is under review.',
      documents: docs.length,
    });
  } catch (err) {
    console.error('submitKyc error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/user/kyc ─────────────────────────────────────────────────────────
const getKycStatus = async (req, res) => {
  try {
    const [user, docs] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: req.user.id },
        select: { kycStatus: true, status: true, walletEnabled: true },
      }),
      prisma.kycDocument.findMany({
        where:   { userId: req.user.id },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    res.json({ kycStatus: user.kycStatus, status: user.status, walletEnabled: user.walletEnabled, documents: docs });
  } catch (err) {
    console.error('getKycStatus error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/user/kpi ─────────────────────────────────────────────────────────
const getKpi = async (req, res) => {
  try {
    const kpiService = require('../services/kpiService');
    const data = await kpiService.getKpiSummary(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('getKpi error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { submitProfile, submitKyc, getKycStatus, getKpi };
