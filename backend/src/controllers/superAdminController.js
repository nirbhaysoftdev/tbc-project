// src/controllers/superAdminController.js
//
// Everything only a SUPER_ADMIN may do to a user account: edit the whole
// record, change credentials, move roles, soft-delete, restore, purge, and
// impersonate read-only.
//
// Two rules hold throughout:
//
//   1. Every write is audited through `recordChange`, awaited, with the
//      before/after diff. A privileged action that cannot be recorded does not
//      happen.
//   2. Nothing here widens what a MEMBER can see. These endpoints read full
//      user rows, but they sit behind requireSuperAdmin and never feed the
//      shared projection in services/memberVisibility.js.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const jwt    = require('jsonwebtoken');

const prisma        = require('../utils/prismaClient');
const walletService = require('../services/walletService');
const { logActivity }  = require('../services/activityLog');
const { recordChange } = require('../services/auditTrail');
const { LIVE_USER }    = require('../utils/roles');
const { sendMail }     = require('../services/mailer');
const otpService       = require('../services/otpService');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// ── What may be written, and nothing else ─────────────────────────────────────
// An allowlist rather than a spread of req.body: without it, a crafted payload
// could set `passwordHash`, `role` or `deletedAt` through the generic update.
// Role and credentials have their own endpoints precisely so they are logged
// and notified separately.
const USER_FIELDS = ['name', 'profilePhoto', 'status', 'kycStatus', 'walletEnabled',
                     'accountType', 'locale', 'emailVerified'];

const PROFILE_FIELDS = ['bio', 'company', 'industry', 'country', 'city', 'phone',
                        'phoneCountry', 'phoneDialCode', 'linkedIn', 'website',
                        'interests', 'jobTitle', 'experienceYears',
                        'billingAddress', 'businessAddress', 'vatNumber'];

const MEMBERSHIP_FIELDS = ['status', 'joinedAt', 'renewedAt', 'expiresAt'];

const USER_STATUSES = ['ACTIVE', 'FROZEN', 'PENDING', 'REJECTED'];
const KYC_STATUSES   = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'];
const ROLES          = ['MEMBER', 'ADMIN', 'SUPER_ADMIN'];

const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1;

/** Pick only allowed keys that were actually sent, so absent ≠ cleared. */
function pick(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

/** The full record, as only a super admin sees it. */
const FULL_USER_INCLUDE = {
  profile:    true,
  membership: true,
  wallet:     true,
  kycDocuments: { orderBy: { uploadedAt: 'desc' } },
};

function present(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

// Unlike /admin/members this is not restricted to role MEMBER: managing admins
// is the point of the panel, so admins and super admins appear too.
const listUsers = async (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 25 } = req.query;
    const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const where = { ...(truthy(req.query.includeDeleted) ? {} : LIVE_USER) };
    if (role   && ROLES.includes(role))          where.role   = role;
    if (status && USER_STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true, status: true,
          kycStatus: true, walletEnabled: true, profilePhoto: true,
          emailVerified: true, accountType: true, createdAt: true,
          deletedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip, take,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, pagination: { page: Number(page), limit: take, total } });
  } catch (err) {
    console.error('listUsers:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.params.id },
      include: FULL_USER_INCLUDE,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const breakdown = user.wallet
      ? await walletService.getWalletBreakdown(user.id)
      : null;

    res.json({
      user: present(user),
      wallet: user.wallet ? walletService.presentWallet(user.wallet, breakdown) : null,
    });
  } catch (err) {
    console.error('getUser:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Edit the whole record ────────────────────────────────────────────────────

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const before = await prisma.user.findUnique({
      where:   { id },
      include: { profile: true, membership: true },
    });
    if (!before) return res.status(404).json({ error: 'User not found' });

    const userData       = pick(req.body, USER_FIELDS);
    const profileData    = pick(req.body.profile    || {}, PROFILE_FIELDS);
    const membershipData = pick(req.body.membership || {}, MEMBERSHIP_FIELDS);

    if (req.file) userData.profilePhoto = `/uploads/${req.file.filename}`;

    // ── Validate before writing anything ──
    if (userData.status && !USER_STATUSES.includes(userData.status)) {
      return res.status(400).json({ error: `status must be one of ${USER_STATUSES.join(', ')}` });
    }
    if (userData.kycStatus && !KYC_STATUSES.includes(userData.kycStatus)) {
      return res.status(400).json({ error: `kycStatus must be one of ${KYC_STATUSES.join(', ')}` });
    }
    if (userData.status && id === req.user.id && userData.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'You cannot move your own account out of ACTIVE' });
    }
    if ('walletEnabled' in userData)  userData.walletEnabled  = truthy(userData.walletEnabled);
    if ('emailVerified' in userData)  userData.emailVerified  = truthy(userData.emailVerified);

    if ('experienceYears' in profileData) {
      const years = profileData.experienceYears;
      profileData.experienceYears = years === null || years === ''
        ? null
        : parseInt(years, 10);
      if (Number.isNaN(profileData.experienceYears)) {
        return res.status(400).json({ error: 'experienceYears must be a number' });
      }
    }
    if ('interests' in profileData && !Array.isArray(profileData.interests)) {
      return res.status(400).json({ error: 'interests must be an array of strings' });
    }
    for (const key of ['joinedAt', 'renewedAt', 'expiresAt']) {
      if (key in membershipData && membershipData[key]) {
        const d = new Date(membershipData[key]);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: `${key} is not a valid date` });
        }
        membershipData[key] = d;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id }, data: userData });
      }
      if (Object.keys(profileData).length) {
        await tx.profile.upsert({
          where:  { userId: id },
          update: profileData,
          create: { userId: id, ...profileData },
        });
      }
      if (Object.keys(membershipData).length) {
        await tx.membership.upsert({
          where:  { userId: id },
          update: membershipData,
          create: { userId: id, ...membershipData },
        });
      }
      // A wallet cannot be switched on without a row to book against. Balances
      // stay derived — syncWallet recomputes them, nothing is invented here.
      if (userData.walletEnabled === true) {
        await tx.wallet.upsert({ where: { userId: id }, update: {}, create: { userId: id } });
        await walletService.syncWallet(id, tx);
      }
      return tx.user.findUnique({ where: { id }, include: FULL_USER_INCLUDE });
    });

    await recordChange({
      actor:    req.user,
      action:   'SA_UPDATE_USER',
      targetId: id,
      before:   { ...before, ...before.profile, ...before.membership },
      after:    { ...updated, ...updated.profile, ...updated.membership },
    });

    const touched = [
      ...Object.keys(userData),
      ...Object.keys(profileData).map((k) => `profile.${k}`),
      ...Object.keys(membershipData).map((k) => `membership.${k}`),
    ];
    logActivity({
      type:        'MEMBER_PROFILE_EDITED',
      title:       `Member record edited: ${updated.name}`,
      description: touched.join(', ') || 'no changes',
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  updated.name,
      metadata:    { fields: touched },
    });

    res.json({ user: present(updated) });
  } catch (err) {
    console.error('updateUser:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Credentials ──────────────────────────────────────────────────────────────

// Changing an email hands over the account, so both addresses are told. The old
// one is the only warning the original owner would ever get.
const changeEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const email = String(req.body.email || '').toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const before = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true },
    });
    if (!before) return res.status(404).json({ error: 'User not found' });
    if (before.email === email) return res.json({ user: before, changed: false });

    // The unique constraint counts soft-deleted rows too: their email is still
    // taken until the row is purged. Say so plainly instead of surfacing a
    // Prisma constraint error.
    const clash = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, deletedAt: true },
    });
    if (clash) {
      return res.status(409).json({
        error: clash.deletedAt
          ? 'That email belongs to a deleted account. Purge it first to free the address.'
          : 'That email is already in use.',
      });
    }

    const updated = await prisma.user.update({
      where:  { id },
      data:   { email, emailVerified: truthy(req.body.markVerified) },
      select: { id: true, name: true, email: true, emailVerified: true },
    });

    await recordChange({
      actor:    req.user,
      action:   'SA_CHANGE_EMAIL',
      targetId: id,
      before:   { email: before.email },
      after:    { email: updated.email },
    });

    logActivity({
      type:        'EMAIL_CHANGED',
      title:       `Email changed: ${updated.name}`,
      description: `${before.email} → ${updated.email}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  updated.name,
    });

    // Fire and forget, to both addresses: a mail failure must not roll back a
    // change that is already committed.
    const subject = 'Your Trillion Business Community sign-in email was changed';
    const body = (where) => `
      <p>Hi ${updated.name || ''},</p>
      <p>The email address used to sign in to your Trillion Business Community
         account was changed by an administrator.</p>
      <p>Previous address: <strong>${before.email}</strong><br/>
         New address: <strong>${updated.email}</strong></p>
      <p>If you did not expect this, contact us immediately.</p>
      <p style="color:#888;font-size:12px">Sent to your ${where} address.</p>`;
    sendMail({ to: before.email,  subject, html: body('previous') })
      .catch((e) => console.error('email-change notice (old) failed:', e.message));
    sendMail({ to: updated.email, subject, html: body('new') })
      .catch((e) => console.error('email-change notice (new) failed:', e.message));

    res.json({ user: updated, changed: true });
  } catch (err) {
    console.error('changeEmail:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Two modes. `mode: "link"` sends the member a reset code and changes nothing,
// which is the one to prefer — nobody but the member ever knows the password.
// `mode: "set"` writes a password directly, for a member who cannot receive
// mail. The plaintext is returned ONCE in that response and never logged,
// because there is no other way to hand it over.
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const mode = req.body.mode === 'set' ? 'set' : 'link';

    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return res.status(404).json({ error: 'User not found' });

    if (mode === 'link') {
      await otpService.issueOtp(user.email, 'RESET');

      await recordChange({
        actor: req.user, action: 'SA_SEND_PASSWORD_RESET', targetId: id,
        extra: { mode, email: user.email },
      });
      logActivity({
        type:        'PASSWORD_RESET_BY_ADMIN',
        title:       `Password reset link sent: ${user.name}`,
        description: `Reset code emailed to ${user.email}`,
        actorId:     req.user.id,
        actorName:   req.user.name,
        targetId:    id,
        targetName:  user.name,
        metadata:    { mode },
      });

      return res.json({ mode, sentTo: user.email });
    }

    const password = typeof req.body.password === 'string' && req.body.password.length >= 8
      ? req.body.password
      : `Tbc-${crypto.randomBytes(6).toString('hex')}`;

    await prisma.user.update({
      where: { id },
      data:  { passwordHash: await bcrypt.hash(password, 12) },
    });

    await recordChange({
      actor: req.user, action: 'SA_SET_PASSWORD', targetId: id,
      // Deliberately records that it happened, never the value.
      extra: { mode, generated: !req.body.password },
    });
    logActivity({
      type:        'PASSWORD_RESET_BY_ADMIN',
      title:       `Password set by super admin: ${user.name}`,
      description: 'Password replaced directly',
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { mode },
    });

    sendMail({
      to: user.email,
      subject: 'Your Trillion Business Community password was changed',
      html: `<p>Hi ${user.name || ''},</p>
             <p>An administrator set a new password on your account. If you did not
                request this, contact us immediately.</p>`,
    }).catch((e) => console.error('password-change notice failed:', e.message));

    res.json({ mode, password });
  } catch (err) {
    if (err.status === 429) {
      return res.status(429).json({ error: 'A reset code was just sent. Wait before sending another.' });
    }
    console.error('resetPassword:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Role ─────────────────────────────────────────────────────────────────────

/** How many super admins are left once `excludingId` is discounted. */
async function otherSuperAdmins(excludingId) {
  return prisma.user.count({
    where: { role: 'SUPER_ADMIN', deletedAt: null, id: { not: excludingId } },
  });
}

const setRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
    }
    if (id === req.user.id && role !== 'SUPER_ADMIN') {
      return res.status(400).json({
        error: 'You cannot demote yourself. Ask another super admin to do it.',
      });
    }

    const before = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true, deletedAt: true },
    });
    if (!before || before.deletedAt) return res.status(404).json({ error: 'User not found' });
    if (before.role === role) return res.json({ user: before, changed: false });

    // Losing the last super admin would leave nobody able to grant the role
    // back, which is unrecoverable without database access.
    if (before.role === 'SUPER_ADMIN' && (await otherSuperAdmins(id)) === 0) {
      return res.status(409).json({
        error: 'This is the last super admin. Promote someone else first.',
      });
    }

    const updated = await prisma.user.update({
      where:  { id },
      data:   { role },
      select: { id: true, name: true, email: true, role: true },
    });

    await recordChange({
      actor: req.user, action: 'SA_SET_ROLE', targetId: id,
      before: { role: before.role }, after: { role: updated.role },
    });
    logActivity({
      type:        'ROLE_CHANGED',
      title:       `Role changed: ${updated.name}`,
      description: `${before.role} → ${updated.role}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  updated.name,
      metadata:    { from: before.role, to: updated.role },
    });

    res.json({ user: updated, changed: true });
  } catch (err) {
    console.error('setRole:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Delete, restore, purge ───────────────────────────────────────────────────

const softDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true, deletedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(409).json({ error: 'Already deleted' });

    if (user.role === 'SUPER_ADMIN' && (await otherSuperAdmins(id)) === 0) {
      return res.status(409).json({
        error: 'This is the last super admin. Promote someone else first.',
      });
    }

    await prisma.user.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedById: req.user.id },
    });

    await recordChange({
      actor: req.user, action: 'SA_SOFT_DELETE_USER', targetId: id,
      extra: { email: user.email, role: user.role },
    });
    logActivity({
      type:        'MEMBER_DELETED',
      title:       `Member deleted: ${user.name}`,
      description: `${user.email} — recoverable, the record was kept`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { soft: true },
    });

    res.json({ message: 'Member deleted', recoverable: true });
  } catch (err) {
    console.error('softDeleteUser:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, deletedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(409).json({ error: 'That account is not deleted' });

    await prisma.user.update({
      where: { id },
      data:  { deletedAt: null, deletedById: null },
    });

    await recordChange({
      actor: req.user, action: 'SA_RESTORE_USER', targetId: id,
      extra: { email: user.email },
    });
    logActivity({
      type:       'MEMBER_RESTORED',
      title:      `Member restored: ${user.name}`,
      description: user.email,
      actorId:    req.user.id,
      actorName:  req.user.name,
      targetId:   id,
      targetName: user.name,
    });

    res.json({ message: 'Member restored' });
  } catch (err) {
    console.error('restoreUser:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// The irreversible one. Requires the member's exact email echoed back in
// `confirm`, so it cannot be reached by a mistyped id or a stale tab.
const purgeUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot purge your own account' });
    }

    const user = await prisma.user.findUnique({
      where:  { id },
      include: { profile: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (String(req.body.confirm || '').toLowerCase().trim() !== user.email.toLowerCase()) {
      return res.status(400).json({
        error: "Type the member's email address in `confirm` to purge this account.",
        expected: 'the account email',
      });
    }
    if (user.role === 'SUPER_ADMIN' && (await otherSuperAdmins(id)) === 0) {
      return res.status(409).json({
        error: 'This is the last super admin. Promote someone else first.',
      });
    }

    // Collect the uploads before the rows cascade away, or the files are
    // stranded on disk with nothing left pointing at them.
    const docs = await prisma.kycDocument.findMany({
      where: { userId: id }, select: { documentUrl: true },
    });
    const files = [
      user.profilePhoto,
      user.profile?.cvUrl, user.profile?.passportUrl,
      user.profile?.residentIdUrl, user.profile?.tradeLicenseUrl,
      ...docs.map((d) => d.documentUrl),
    ].filter(Boolean);

    // Audited BEFORE the delete: the FK is ON DELETE SET NULL, so a log row
    // written afterwards would have no target to point at.
    await recordChange({
      actor: req.user, action: 'SA_PURGE_USER', targetId: id,
      extra: { email: user.email, name: user.name, role: user.role, files: files.length },
    });

    await prisma.user.delete({ where: { id } });

    files.forEach((url) => {
      // Resolve and confine to uploads/ — a stored path is data, so it is never
      // trusted to stay inside the directory on its own.
      const abs = path.resolve(UPLOADS_ROOT, path.relative('/uploads', url).replace(/^\/+/, ''));
      if (abs.startsWith(UPLOADS_ROOT + path.sep)) fs.unlink(abs, () => {});
    });

    logActivity({
      type:        'MEMBER_PURGED',
      title:       `Member permanently purged: ${user.name}`,
      description: `${user.email} — record and ${files.length} file(s) destroyed`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetName:  user.name,
      metadata:    { email: user.email, files: files.length },
    });

    res.json({ message: 'Member purged permanently', filesRemoved: files.length });
  } catch (err) {
    // Restrict foreign keys (ledger rows) can block a purge. That is the
    // soft-delete case, so say so rather than returning a bare 500.
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(409).json({
        error: 'This member has ledger records that cannot be deleted. '
             + 'Use delete (recoverable) instead, which keeps the record and hides the account.',
      });
    }
    console.error('purgeUser:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Impersonation ────────────────────────────────────────────────────────────

// Mints a short-lived token that authenticates as the member. The middleware
// refuses every non-GET while it is in use (see middleware/auth.js), which is
// what keeps the audit trail honest: nothing can be written under a borrowed
// identity, so every write in the logs belongs to whoever really made it.
const impersonate = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You are already signed in as yourself' });
    }

    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'A super admin cannot be impersonated' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, impersonatedBy: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '30m' },
    );

    await recordChange({
      actor: req.user, action: 'SA_IMPERSONATE', targetId: id,
      extra: { email: user.email, readOnly: true, expiresIn: '30m' },
    });
    logActivity({
      type:        'IMPERSONATION_STARTED',
      title:       `Impersonation started: ${user.name}`,
      description: `${req.user.email} is viewing as ${user.email} (read-only, 30 minutes)`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
    });

    res.json({
      token,
      readOnly:  true,
      expiresIn: 1800,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) {
    console.error('impersonate:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Tells the client what it is holding. Reachable with an impersonation token
// (it is a GET), so the UI can show its banner after a reload.
const impersonationStatus = (req, res) => {
  res.json({
    impersonating: Boolean(req.impersonation),
    by:   req.impersonation?.byEmail || null,
    user: { id: req.user.id, name: req.user.name, email: req.user.email },
  });
};

module.exports = {
  listUsers, getUser, updateUser,
  changeEmail, resetPassword, setRole,
  softDeleteUser, restoreUser, purgeUser,
  impersonate, impersonationStatus,
};
