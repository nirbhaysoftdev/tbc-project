// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../utils/prismaClient');
const otpService = require('../services/otpService');
const {
  sendWelcomePendingEmail,
  sendAdminNewSignupNotification,
} = require('../services/mailer');

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ── Register (self-service community signup) ──
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  // Multipart form data (files handled by multer): fields arrive as strings in req.body
  const {
    name,
    email,
    password,
    accountType,          // 'PROFESSIONAL' | 'BUSINESS'
    phone,
    phoneCountry,
    phoneDialCode,
    country,
    linkedIn,
    residentId,           // number/text field
    billingAddress,
    tradeLicense,         // text field (fallback if no file)
    vatNumber,
    businessAddress,
    website,
  } = req.body;

  const normEmail = String(email).toLowerCase().trim();

  if (!['PROFESSIONAL', 'BUSINESS'].includes(accountType)) {
    return res.status(400).json({ error: 'accountType must be PROFESSIONAL or BUSINESS' });
  }

  try {
    // Require prior OTP verification for this email
    const verified = await otpService.isEmailRecentlyVerified(normEmail, 'SIGNUP', 60);
    if (!verified) {
      return res.status(400).json({ error: 'Email not verified. Please verify with the code sent to your inbox.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normEmail } });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // File uploads (via multer.fields)
    const files = req.files || {};
    const cvUrl            = files.cv?.[0]            ? `/uploads/signup/${files.cv[0].filename}`            : null;
    const residentIdUrl    = files.residentIdFile?.[0]? `/uploads/signup/${files.residentIdFile[0].filename}`: null;
    const tradeLicenseUrl  = files.tradeLicense?.[0]  ? `/uploads/signup/${files.tradeLicense[0].filename}`  : null;

    const profileData = {
      country:        country || null,
      phone:          phone || null,
      phoneCountry:   phoneCountry || null,
      phoneDialCode:  phoneDialCode || null,
      linkedIn:       linkedIn || null,
      website:        website || null,
      cvUrl,
      residentIdUrl,
      billingAddress: billingAddress || null,
      tradeLicenseUrl,
      vatNumber:      vatNumber || null,
      businessAddress: businessAddress || null,
    };

    const user = await prisma.user.create({
      data: {
        name,
        email: normEmail,
        passwordHash,
        role: 'MEMBER',
        membershipTier: 'BASIC',
        status: 'PENDING',
        kycStatus: 'NOT_SUBMITTED',
        walletEnabled: false,
        accountType,
        emailVerified: true,
        profile: { create: profileData },
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        kycStatus: true, membershipTier: true, walletEnabled: true,
        profilePhoto: true, accountType: true, emailVerified: true,
      },
    });

    await prisma.adminLog.create({
      data: { adminId: user.id, action: 'SELF_REGISTER', details: { email: normEmail, accountType } },
    }).catch(() => {});

    sendWelcomePendingEmail(user).catch((e) => console.error('welcome email failed:', e.message));
    sendAdminNewSignupNotification({ ...user, signupMethod: 'email' })
      .catch((e) => console.error('admin notify failed:', e.message));

    const token = signToken(user);
    res.status(201).json({
      token, user,
      message: 'Registration successful. Your application is pending admin review.',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Send OTP ──────────────────────────────────
const sendOtp = async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  const normalized = email.toLowerCase().trim();

  try {
    // Block if a verified account already exists
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const { expiresAt, expiresMinutes } = await otpService.issueOtp(normalized, 'SIGNUP');
    res.json({
      message: 'Verification code sent',
      expiresAt,
      expiresMinutes,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('sendOtp error:', err);
    res.status(status).json({ error: err.message || 'Failed to send code' });
  }
};

// ── Verify OTP ────────────────────────────────
const verifyOtp = async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }
  try {
    await otpService.verifyOtp(email, code, 'SIGNUP');
    res.json({ verified: true, message: 'Email verified' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('verifyOtp error:', err);
    res.status(status).json({ error: err.message || 'Verification failed' });
  }
};

// ── Google Sign-in / Sign-up ──────────────────
const googleAuth = async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google Sign-in is not configured on the server.' });
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }
    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name || email.split('@')[0];

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { wallet: true },
    });

    if (!user) {
      // Create new user via Google — no password, PENDING status until admin approval
      user = await prisma.user.create({
        data: {
          name,
          email,
          googleId,
          emailVerified: Boolean(payload.email_verified),
          role: 'MEMBER',
          membershipTier: 'BASIC',
          status: 'PENDING',
          kycStatus: 'NOT_SUBMITTED',
          profilePhoto: payload.picture || null,
          profile: { create: {} },
        },
        include: { wallet: true },
      });

      sendWelcomePendingEmail(user).catch((e) => console.error('welcome email failed:', e.message));
      sendAdminNewSignupNotification({ ...user, signupMethod: 'google' })
        .catch((e) => console.error('admin notify failed:', e.message));
    } else if (!user.googleId) {
      // Link Google to existing email account
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          emailVerified: true,
          profilePhoto: user.profilePhoto || payload.picture || null,
        },
        include: { wallet: true },
      });
    }

    if (user.status === 'FROZEN')  return res.status(403).json({ error: 'Your account has been frozen. Contact support.' });
    if (user.status === 'REJECTED') return res.status(403).json({ error: 'Your membership application was not approved.' });

    const token = signToken(user);
    res.json({
      token,
      user: safeUser(user),
      message: 'Signed in with Google',
      needsAccountType: !user.accountType,  // frontend can prompt to pick professional/business
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Invalid Google credential' });
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
    const user = await prisma.user.findUnique({
      where:  { email: String(email).toLowerCase().trim() },
      select: {
        id: true, name: true, email: true, passwordHash: true,
        role: true, status: true, kycStatus: true,
        membershipTier: true, profilePhoto: true, walletEnabled: true,
        emailVerified: true, accountType: true,
        wallet: { select: {
          investmentAmount: true, profitAmount: true,
          totalBalance: true, currency: true, frozen: true,
        }},
      },
    });

    if (!user || !user.passwordHash) {
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

    const token = signToken(user);

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
        emailVerified:  user.emailVerified  ?? false,
        accountType:    user.accountType,
        wallet:         user.wallet,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Logout ──────────────────────────────────────
const logout = async (_req, res) => {
  res.json({ message: 'Logged out successfully' });
};

// ── Get current user ──────────────────────────
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.user.id },
      include: { wallet: true, profile: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    let kpiSummary = null;
    try {
      kpiSummary = await prisma.userKpiSummary.findUnique({
        where:  { userId: req.user.id },
        select: { totalScore: true },
      });
    } catch { /* skip */ }

    const { passwordHash, ...safe } = user;
    res.json({ ...safe, kpiSummary });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { register, login, logout, me, sendOtp, verifyOtp, googleAuth };
