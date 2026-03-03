// src/controllers/adminController.js
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prismaClient'); // Prisma 7 — uses adapter-pg singleton

// ── Get all members ───────────────────────────
const getMembers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const where = { role: 'MEMBER' };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { wallet: true },
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ members, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create member ─────────────────────────────
const createMember = async (req, res) => {
  try {
    const { name, email, password, investmentAmount = 0, profitAmount = 0 } = req.body;
    const profilePhoto = req.file ? `/uploads/${req.file.filename}` : null;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const passwordHash   = await bcrypt.hash(password, 12);
    const totalBalance   = parseFloat(investmentAmount) + parseFloat(profitAmount);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        profilePhoto,
        role: 'MEMBER',
        wallet: {
          create: {
            investmentAmount: parseFloat(investmentAmount),
            profitAmount:     parseFloat(profitAmount),
            totalBalance,
          },
        },
      },
      include: { wallet: true },
    });

    // Log action
    await prisma.adminLog.create({
      data: {
        adminId:  req.user.id,
        targetId: user.id,
        action:   'CREATE_MEMBER',
        details:  { name, email },
      },
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update member ─────────────────────────────
const updateMember = async (req, res) => {
  try {
    const { id }    = req.params;
    const { name, email, password } = req.body;
    const profilePhoto = req.file ? `/uploads/${req.file.filename}` : undefined;

    const updateData = {};
    if (name)  updateData.name  = name;
    if (email) updateData.email = email;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 12);
    if (profilePhoto) updateData.profilePhoto = profilePhoto;

    const user = await prisma.user.update({
      where:   { id },
      data:    updateData,
      include: { wallet: true },
    });

    await prisma.adminLog.create({
      data: { adminId: req.user.id, targetId: id, action: 'UPDATE_MEMBER' },
    });

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete member ─────────────────────────────
const deleteMember = async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Member deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Freeze / unfreeze ─────────────────────────
const toggleFreeze = async (req, res) => {
  try {
    const user   = await prisma.user.findUnique({ where: { id: req.params.id } });
    const frozen = user.status !== 'FROZEN';

    await Promise.all([
      prisma.user.update({
        where: { id: req.params.id },
        data:  { status: frozen ? 'FROZEN' : 'ACTIVE' },
      }),
      prisma.wallet.update({
        where: { userId: req.params.id },
        data:  { frozen },
      }),
    ]);

    await prisma.adminLog.create({
      data: { adminId: req.user.id, targetId: req.params.id, action: frozen ? 'FREEZE_ACCOUNT' : 'UNFREEZE_ACCOUNT' },
    });

    res.json({ frozen, message: frozen ? 'Account frozen' : 'Account unfrozen' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update wallet amounts ─────────────────────
const updateWallet = async (req, res) => {
  try {
    const { investmentAmount, profitAmount } = req.body;
    const inv   = parseFloat(investmentAmount);
    const prof  = parseFloat(profitAmount);
    const total = inv + prof;

    const wallet = await prisma.wallet.upsert({
      where:  { userId: req.params.id },
      update: { investmentAmount: inv, profitAmount: prof, totalBalance: total },
      create: { userId: req.params.id, investmentAmount: inv, profitAmount: prof, totalBalance: total },
    });

    await prisma.adminLog.create({
      data: {
        adminId:  req.user.id,
        targetId: req.params.id,
        action:   'UPDATE_WALLET',
        details:  { investmentAmount: inv, profitAmount: prof, totalBalance: total },
      },
    });

    res.json({ wallet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Add manual transaction ────────────────────
const addTransaction = async (req, res) => {
  try {
    const { userId, type, description, amount, status = 'COMPLETED' } = req.body;

    const transaction = await prisma.transaction.create({
      data: { userId, type, description, amount: parseFloat(amount), status },
    });

    // Update wallet balance
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (wallet) {
      const delta = type === 'CREDIT' ? parseFloat(amount) : -parseFloat(amount);
      await prisma.wallet.update({
        where: { userId },
        data:  { totalBalance: Math.max(0, wallet.totalBalance + delta) },
      });
    }

    await prisma.adminLog.create({
      data: { adminId: req.user.id, targetId: userId, action: 'ADD_TRANSACTION', details: { type, amount } },
    });

    res.status(201).json({ transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Admin stats ───────────────────────────────
const getStats = async (req, res) => {
  try {
    const [totalMembers, wallets, transactions] = await Promise.all([
      prisma.user.count({ where: { role: 'MEMBER' } }),
      prisma.wallet.aggregate({ _sum: { investmentAmount: true, profitAmount: true, totalBalance: true } }),
      prisma.transaction.count({ where: { status: 'COMPLETED' } }),
    ]);

    res.json({
      totalMembers,
      totalAUM:              wallets._sum.investmentAmount || 0,
      totalProfitDistributed: wallets._sum.profitAmount    || 0,
      totalBalance:          wallets._sum.totalBalance     || 0,
      totalTransactions:     transactions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Export all data CSV ───────────────────────
const exportData = async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where:   { role: 'MEMBER' },
      include: { wallet: true },
    });

    const header = 'Name,Email,Status,Investment,Profit,Balance,Joined\n';
    const rows   = members.map(m =>
      `"${m.name}","${m.email}",${m.status},${m.wallet?.investmentAmount || 0},${m.wallet?.profitAmount || 0},${m.wallet?.totalBalance || 0},${m.createdAt.toISOString()}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="TBC-Members-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getMembers, createMember, updateMember, deleteMember,
  toggleFreeze, updateWallet, addTransaction, getStats, exportData,
};
