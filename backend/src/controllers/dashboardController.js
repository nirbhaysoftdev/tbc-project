// src/controllers/dashboardController.js
const prisma = require('../utils/prismaClient'); // Prisma 7 — uses adapter-pg singleton

// ── Dashboard summary ─────────────────────────
const getSummary = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true,
        profilePhoto: true, status: true,
        wallet: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const wallet = user.wallet || {
      investmentAmount: 0,
      profitAmount:     0,
      totalBalance:     0,
      currency:         'EUR',
    };

    // ROI %
    const roi = wallet.investmentAmount > 0
      ? ((wallet.profitAmount / wallet.investmentAmount) * 100).toFixed(2)
      : '0.00';

    // Recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    5,
    });

    res.json({
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        profilePhoto: user.profilePhoto,
        status:       user.status,
      },
      wallet: {
        investmentAmount: wallet.investmentAmount,
        profitAmount:     wallet.profitAmount,
        totalBalance:     wallet.totalBalance,
        currency:         wallet.currency,
        roi:              parseFloat(roi),
        frozen:           wallet.frozen,
        lastUpdated:      wallet.lastUpdated,
      },
      recentTransactions,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Chart data (balance history from transactions) ──
const getChartData = async (req, res) => {
  try {
    const { period = '1Y' } = req.query;

    const periodMap = {
      '1M':  30,
      '3M':  90,
      '6M':  180,
      '1Y':  365,
      'All': 3650,
    };
    const days = periodMap[period] || 365;
    const from = new Date();
    from.setDate(from.getDate() - days);

    // Get transactions in period
    const transactions = await prisma.transaction.findMany({
      where: {
        userId:    req.user.id,
        createdAt: { gte: from },
        status:    'COMPLETED',
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build running balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
    });

    // Generate chart points (group by week/month depending on period)
    const chartData = buildChartPoints(transactions, wallet, period, from);

    res.json({ period, chartData });
  } catch (err) {
    console.error('Chart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Build chart data points ───────────────────
function buildChartPoints(transactions, wallet, period, from) {
  const now     = new Date();
  const base    = wallet?.investmentAmount || 0;
  const points  = [];

  // Create intervals
  const intervalDays = period === '1M' ? 3 : period === '3M' ? 7 : period === '6M' ? 14 : 30;
  let current = new Date(from);

  while (current <= now) {
    const txnsToDate = transactions.filter(t => new Date(t.createdAt) <= current);
    const credits    = txnsToDate.filter(t => t.type === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const debits     = txnsToDate.filter(t => t.type === 'DEBIT').reduce((s, t) => s + t.amount, 0);
    const balance    = base + credits - debits;

    points.push({
      date:    current.toISOString().split('T')[0],
      balance: Math.max(0, balance),
    });

    current = new Date(current);
    current.setDate(current.getDate() + intervalDays);
  }

  // Always include current balance as last point
  if (wallet) {
    points.push({
      date:    now.toISOString().split('T')[0],
      balance: wallet.totalBalance,
    });
  }

  return points;
}

module.exports = { getSummary, getChartData };
