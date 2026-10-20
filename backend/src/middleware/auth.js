// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient'); // Prisma 7 - uses adapter-pg singleton

// ── Verify JWT ────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true, email: true, name: true, deletedAt: true },
    });

    if (!user)                      return res.status(401).json({ error: 'User not found' });
    // A soft-deleted account is gone as far as every caller is concerned. The
    // row survives so the ledger keeps its references, not so the login does.
    if (user.deletedAt)             return res.status(401).json({ error: 'User not found' });
    if (user.status === 'FROZEN')   return res.status(403).json({ error: 'Account is frozen' });
    if (user.status === 'REJECTED') return res.status(403).json({ error: 'Membership application rejected' });

    req.user = user;

    // ── Impersonation ───────────────────────────
    // A super admin can mint a token that authenticates AS another member in
    // order to see what they see. It is strictly read-only: the audit log can
    // only stay truthful if nothing can be written while wearing someone
    // else's identity. See superAdminController.impersonate.
    if (decoded.impersonatedBy) {
      const actor = await prisma.user.findUnique({
        where:  { id: decoded.impersonatedBy },
        select: { id: true, role: true, name: true, email: true, deletedAt: true },
      });
      // The grant dies with the grantor's authority: a demoted or deleted
      // super admin's outstanding impersonation tokens stop working at once.
      if (!actor || actor.deletedAt || actor.role !== 'SUPER_ADMIN') {
        return res.status(401).json({ error: 'Impersonation grant is no longer valid' });
      }

      req.impersonation = { by: actor.id, byName: actor.name, byEmail: actor.email };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        return res.status(403).json({
          error: 'Impersonation is read-only. End it before making changes.',
          impersonating: true,
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Require ADMIN role ────────────────────────
// SUPER_ADMIN is a strict superset of ADMIN, so it passes every check an admin
// passes. That is what keeps all the existing admin routes working untouched.
//
// It deliberately fails while impersonating: the borrowed identity is a
// member's, and carrying admin rights into it would defeat the point.
const requireAdmin = (req, res, next) => {
  if (req.impersonation) {
    return res.status(403).json({ error: 'Not available while impersonating a member' });
  }
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ── Require SUPER_ADMIN role ──────────────────
// The gate on everything irreversible or money-moving-without-a-ledger-entry:
// deletions, membership rejection, freezing, credential changes, wallet
// opening balances, withdrawal decisions, bulk export.
const requireSuperAdmin = (req, res, next) => {
  if (req.impersonation) {
    return res.status(403).json({ error: 'Not available while impersonating a member' });
  }
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

// ── Require ACTIVE status ─────────────────────
// Blocks PENDING users from accessing member-only platform routes.
// Onboarding (/api/user/*), profile edit (/api/profile), and auth (/api/auth/*)
// bypass this - they only use authenticate.
const requireActive = (req, res, next) => {
  if (req.user?.status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'Your account is pending admin approval.',
      status: req.user?.status,
    });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireSuperAdmin, requireActive };
