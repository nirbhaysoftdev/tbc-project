// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../utils/prismaClient');
const { logActivity } = require('../services/activityLog');
const walletService = require('../services/walletService');
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

/**
 * The stored wallet row only holds the manual opening balance, so capital and
 * profit have to be derived from the project ledger before being returned.
 */
async function derivedWallet(userId, wallet) {
  if (!wallet) return null;
  return walletService.presentWallet(wallet, await walletService.getWalletBreakdown(userId));
}

// ── Register (self-service community signup) ──
// Uses the same field structure, validation rules, and document requirements
// as the admin "Add Member" flow (see adminController.createMember).
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  // Multipart form data (files handled by multer): fields arrive as strings in req.body
  const {
    memberType,            // 'COMPANY' | 'PERSONAL'
    email,
    password,
    mobile,
    mobileCountry,
    mobileDialCode,
    companyName,
    fullName,
    city,
    country,
  } = req.body;

  const isCompany  = memberType === 'COMPANY';
  const isPersonal = memberType === 'PERSONAL';
  if (!isCompany && !isPersonal) {
    return res.status(400).json({ error: 'Member type must be COMPANY or PERSONAL' });
  }
  if (!mobile || !String(mobile).trim())   return res.status(400).json({ error: 'Mobile number is required' });
  if (!city || !String(city).trim())       return res.status(400).json({ error: 'City is required' });
  if (!country || !String(country).trim()) return res.status(400).json({ error: 'Country is required' });

  const files = req.files || {};
  const photoFile        = files.photo?.[0];
  const tradeLicenseFile = files.tradeLicense?.[0];
  const passportFile     = files.passport?.[0];
  const residentIdFile   = files.residentId?.[0];

  let name;
  if (isCompany) {
    if (!companyName || !String(companyName).trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    if (!tradeLicenseFile) {
      return res.status(400).json({ error: 'Company trade licence / registration certificate is required' });
    }
    name = companyName.trim();
  } else {
    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!residentIdFile) {
      return res.status(400).json({ error: 'Resident ID card is required' });
    }
    name = fullName.trim();
  }

  const normEmail = String(email).toLowerCase().trim();

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

    const profileData = {
      company:         isCompany ? companyName.trim() : null,
      city:            city.trim(),
      country:         country.trim(),
      phone:           mobile.trim(),
      phoneCountry:    mobileCountry  || null,
      phoneDialCode:   mobileDialCode || null,
      tradeLicenseUrl: tradeLicenseFile ? `/uploads/signup/${tradeLicenseFile.filename}` : null,
      residentIdUrl:   residentIdFile   ? `/uploads/signup/${residentIdFile.filename}`   : null,
      passportUrl:     passportFile     ? `/uploads/signup/${passportFile.filename}`     : null,
    };

    const user = await prisma.user.create({
      data: {
        name,
        email: normEmail,
        passwordHash,
        profilePhoto:  photoFile ? `/uploads/signup/${photoFile.filename}` : null,
        role:          'MEMBER',
                status:        'PENDING',
        kycStatus:     'NOT_SUBMITTED',
        walletEnabled: false,
        accountType:   isCompany ? 'BUSINESS' : 'PROFESSIONAL',
        emailVerified: true,
        profile:       { create: profileData },
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        kycStatus: true, walletEnabled: true,
        profilePhoto: true, accountType: true, emailVerified: true,
      },
    });

    await prisma.adminLog.create({
      data: { adminId: user.id, action: 'SELF_REGISTER', details: { email: normEmail, memberType } },
    }).catch(() => {});

    logActivity({
      type:        'MEMBER_REGISTERED',
      title:       `New member request: ${user.name}`,
      description: `${normEmail} · ${memberType}`,
      actorId:     user.id,
      actorName:   user.name,
      targetId:    user.id,
      targetName:  user.name,
      metadata:    { email: normEmail, memberType, signupMethod: 'email' },
    });

    sendWelcomePendingEmail(user).catch((e) => console.error('welcome email failed:', e.message));
    sendAdminNewSignupNotification({ ...user, signupMethod: 'email' })
      .catch((e) => console.error('admin notify failed:', e.message));

    // No token is issued here - pending members cannot log in until an admin approves them.
    res.status(201).json({
      user,
      message: 'Registration successful. Your application is pending admin review. You will receive an email once approved.',
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
      // Create new user via Google - no password, PENDING status until admin approval
      user = await prisma.user.create({
        data: {
          name,
          email,
          googleId,
          emailVerified: Boolean(payload.email_verified),
          role: 'MEMBER',
                    status: 'PENDING',
          kycStatus: 'NOT_SUBMITTED',
          profilePhoto: payload.picture || null,
          profile: { create: {} },
        },
        include: { wallet: true },
      });

      logActivity({
      type:        'MEMBER_REGISTERED',
      title:       `New member request: ${user.name}`,
      description: `${normEmail} · ${memberType}`,
      actorId:     user.id,
      actorName:   user.name,
      targetId:    user.id,
      targetName:  user.name,
      metadata:    { email: normEmail, memberType, signupMethod: 'email' },
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
      user: { ...safeUser(user), wallet: await derivedWallet(user.id, user.wallet) },
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
        profilePhoto: true, walletEnabled: true,
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
    if (user.status === 'PENDING') {
      return res.status(403).json({
        error: 'Your account is pending admin approval. You will receive an email once approved.',
        status: 'PENDING',
      });
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
        profilePhoto:   user.profilePhoto,
        emailVerified:  user.emailVerified  ?? false,
        accountType:    user.accountType,
        wallet:         await derivedWallet(user.id, user.wallet),
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

// ── Forgot password: request a reset OTP ──────
// Always responds the same way whether or not the email exists, so account
// existence is never revealed through this endpoint.
const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  const normalized = email.toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (user) {
      await otpService.issueOtp(normalized, 'RESET').catch((e) => {
        // Swallow resend-cooldown/etc. errors so the response never differs
        // based on whether an account exists.
        if (e.status !== 429) console.error('forgotPassword issueOtp error:', e.message);
      });
    }
  } catch (err) {
    console.error('forgotPassword error:', err);
  }

  res.json({ message: 'If an account exists for this email, a verification code has been sent.' });
};

// ── Forgot password: verify OTP and set a new password ──
const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const normalized = String(email).toLowerCase().trim();

  try {
    await otpService.verifyOtp(normalized, code, 'RESET');

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ message: 'Password updated successfully. You can now log in with your new password.' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('resetPassword error:', err);
    res.status(status).json({ error: err.message || 'Could not reset password' });
  }
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
    res.json({ ...safe, wallet: await derivedWallet(user.id, user.wallet), kpiSummary });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  register, login, logout, me, sendOtp, verifyOtp, googleAuth,
  forgotPassword, resetPassword,
};
