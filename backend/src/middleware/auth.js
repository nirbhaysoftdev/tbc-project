// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient'); // Prisma 7 — uses adapter-pg singleton

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
      select: { id: true, role: true, status: true, email: true, name: true },
    });

    if (!user)                    return res.status(401).json({ error: 'User not found' });
    if (user.status === 'FROZEN') return res.status(403).json({ error: 'Account is frozen' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Require ADMIN role ────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
