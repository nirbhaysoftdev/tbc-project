// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const prisma = require('../utils/prismaClient');

// ── Register (self-service community signup) ──
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { name, email, password, country, company, industry } = req.body;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role:          'MEMBER',
        membershipTier: 'BASIC',
        status:        'PENDING',
        kycStatus:     'NOT_SUBMITTED',
        walletEnabled: false,
        // Create basic profile stub
        profile: {
          create: {
            country:  country  || null,
            company:  company  || null,
            industry: industry || null,
          },
        },
      },
      select: {
        id: true, name: true, email: true,
        role: true, status: true, kycStatus: true,
        membershipTier: true, walletEnabled: true, profilePhoto: true,
      },
    });

    // Audit log
    await prisma.adminLog.create({
      data: { adminId: user.id, action: 'SELF_REGISTER', details: { email } },
    }).catch(() => {}); // non-blocking

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user,
      message: 'Registration successful. Please complete your profile and submit KYC for admin review.',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Login ─────────────────────────────────────
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Explicit select avoids referencing new columns (walletEnabled) that may
    // not exist in the DB yet if migration hasn't been run.
    const user = await prisma.user.findUnique({
      where:  { email },
      select: {
        id: true, name: true, email: true, passwordHash: true,
        role: true, status: true, kycStatus: true,
        membershipTier: true, profilePhoto: true,
        wallet: { select: {
          investmentAmount: true, profitAmount: true,
          totalBalance: true, currency: true, frozen: true,
        }},
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'FROZEN') {
      return res.status(403).json({ error: 'Your account has been frozen. Contact support.' });
    }
    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your membership application was not approved. Contact support.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // KPI — log login for active members only
    if (user.status === 'ACTIVE') {
      const kpiService = require('../services/kpiService');
      kpiService.logKpiAction(user.id, 'login').catch(() => {});
    }

    res.json({
      token,
      user: {
        id:             user.id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        status:         user.status,
        kycStatus:      user.kycStatus      ?? 'NOT_SUBMITTED',
        walletEnabled:  user.walletEnabled  ?? false,
        membershipTier: user.membershipTier ?? 'BASIC',
        profilePhoto:   user.profilePhoto,
        wallet:         user.wallet,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Logout (client-side token removal) ──────────
const logout = async (_req, res) => {
  res.json({ message: 'Logged out successfully' });
};

// ── Get current user ──────────────────────────
const me = async (req, res) => {
  try {
    // Use include (not select) so Prisma doesn't validate individual field names
    // against the generated client — this lets the query work even if
    // walletEnabled hasn't been migrated yet (it just comes back as undefined).
    const user = await prisma.user.findUnique({
      where:   { id: req.user.id },
      include: { wallet: true, profile: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // kpiSummary lives in a new table — wrap separately so a missing migration
    // doesn't break the entire /me endpoint.
    let kpiSummary = null;
    try {
      kpiSummary = await prisma.userKpiSummary.findUnique({
        where:  { userId: req.user.id },
        select: { totalScore: true },
      });
    } catch { /* table not yet migrated — skip silently */ }

    const { passwordHash, ...safe } = user;
    res.json({ ...safe, kpiSummary });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { register, login, logout, me };
