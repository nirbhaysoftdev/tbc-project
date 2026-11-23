// src/controllers/dashboardController.js
const prisma = require('../utils/prismaClient'); // Prisma 7 - uses adapter-pg singleton
const walletService = require('../services/walletService');

// ── Dashboard summary ─────────────────────────
const getSummary = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true,
        profilePhoto: true, status: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const [wallet, byProject, recentTransactions] = await Promise.all([
      walletService.getWalletBreakdown(req.user.id),
      walletService.getProjectBreakdown(req.user.id),
      prisma.transaction.findMany({
        // Undone transactions are the administration's correction, not the member's history.
        where:   { userId: req.user.id, status: { not: 'REVERSED' } },
        orderBy: [{ loggedAt: 'desc' }, { createdAt: 'desc' }],
        take:    5,
        include: { project: { select: { id: true, title: true } } },
      }),
    ]);

    const roi = wallet.investedCapital > 0
      ? ((wallet.grossProfit / wallet.investedCapital) * 100).toFixed(2)
      : '0.00';

    res.json({
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        profilePhoto: user.profilePhoto,
        status:       user.status,
      },
      wallet: {
        ...wallet,
        // Legacy field names kept so existing clients keep rendering.
        investmentAmount: wallet.investedCapital,
        profitAmount:     wallet.availableProfit,
        roi:              parseFloat(roi),
      },
      byProject,
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
    const wallet = await walletService.getWalletBreakdown(req.user.id);

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
  const base    = wallet?.investedCapital || 0;
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
  if (wallet?.exists) {
    points.push({
      date:    now.toISOString().split('T')[0],
      balance: wallet.totalBalance,
    });
  }

  return points;
}

// The signed-in member's recurring returns - insurance and monthly fix profit -
// with each amount recomputed from the capital they hold right now.
const getReturns = async (req, res) => {
  try {
    const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const [policy, plans, received] = await Promise.all([
      require('../services/insurance').getForUser(req.user.id),
      require('../services/investmentEngine').monthlyPlansForUser(req.user.id),
      prisma.profitRecord.aggregate({
        where: { userId: req.user.id, type: 'INSURANCE', generatedAt: { gte: yearAgo } },
        _sum: { amount: true },
      }),
    ]);
    res.json({
      insurance: policy && {
        ratePercent: policy.ratePercent, renewalDate: policy.renewalDate, status: policy.status,
        capital: policy.capital, expectedAmount: policy.expectedAmount,
        lastCreditedAt: policy.lastCreditedAt, lastCreditedAmount: policy.lastCreditedAmount,
        // Insurance actually credited in the last 12 months.
        receivedLastYear: received._sum.amount || 0,
      },
      monthly: plans.map((p) => ({
        project: p.project, rate: p.rate, fixedAmount: p.fixedAmount, monthlyProfitDay: p.monthlyProfitDay,
        nextDate: p.nextDate, capital: p.capital, eligibleCapital: p.eligibleCapital, expectedAmount: p.expectedAmount,
      })),
    });
  } catch (err) {
    console.error('Returns error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Portfolio: live balance, where the capital sits, and profit month by month ──
const MONTHS = 12;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const getPortfolio = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);

    const [wallet, byProject, records] = await Promise.all([
      walletService.getWalletBreakdown(userId),
      walletService.getProjectBreakdown(userId),
      prisma.profitRecord.findMany({
        where: { userId, generatedAt: { gte: since } },
        select: { amount: true, type: true, generatedAt: true },
      }),
    ]);

    // One bucket per month, empty months included so the bars keep their spacing.
    const buckets = new Map();
    for (let i = 0; i < MONTHS; i += 1) {
      const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
      buckets.set(monthKey(d), { month: monthKey(d), monthly: 0, insurance: 0, oneTime: 0, total: 0 });
    }
    for (const r of records) {
      const b = buckets.get(monthKey(r.generatedAt));
      if (!b) continue;
      const field = r.type === 'MONTHLY' ? 'monthly' : r.type === 'INSURANCE' ? 'insurance' : 'oneTime';
      b[field] += r.amount;
      b.total += r.amount;
    }
    const round = (n) => Math.round(n * 100) / 100;
    const monthlyProfit = [...buckets.values()].map((b) => ({
      month: b.month, monthly: round(b.monthly), insurance: round(b.insurance), oneTime: round(b.oneTime), total: round(b.total),
    }));

    res.json({ wallet, byProject, monthlyProfit });
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getSummary, getChartData, getReturns, getPortfolio };
