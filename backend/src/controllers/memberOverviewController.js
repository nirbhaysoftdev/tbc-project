// src/controllers/memberOverviewController.js
//
// One member, everything about their money, in a single read — the admin
// member detail page. Nothing here computes a balance on its own: capital,
// profit and available profit all come from walletService so this page can
// never disagree with the member's own dashboard.
//
// The same payload backs the "Email Now" button: the statement email is
// rendered from exactly what the admin is looking at, so there is one shape to
// keep correct instead of two.
const prisma = require('../utils/prismaClient');
const walletService = require('../services/walletService');
const { sendMemberStatementEmail } = require('../services/mailer');
const { logActivity } = require('../services/activityLog');

const money = walletService.money;

const monthKey = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** Every month between the first and the last event, so a gap month shows as a flat line rather than vanishing. */
function monthRange(from, to) {
  const months = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/**
 * Monthly series for the detail page charts. Capital and profit are
 * accumulated from the records that actually created them (investments,
 * profit records, withdrawals) rather than from the cached wallet total, so
 * each point is explainable from the ledger.
 *
 * The opening balance has no date behind it — it was set by the legacy admin
 * tools — so it is seeded into the first point instead of being attributed to
 * a month it cannot be proven to belong to.
 */
function buildMonthlySeries({ investments, profitRecords, transactions, breakdown, joinedAt }) {
  const dated = [
    ...investments.map((i) => new Date(i.investedAt)),
    ...profitRecords.map((p) => new Date(p.generatedAt)),
    ...transactions.map((t) => new Date(t.createdAt)),
  ].filter((d) => !Number.isNaN(d.getTime()));

  const first = dated.length ? new Date(Math.min(...dated)) : new Date(joinedAt);
  const months = monthRange(first, new Date());

  const capitalIn = new Map();
  const capitalOut = new Map();
  const profitIn = new Map();
  const withdrawn = new Map();
  const bump = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);

  investments.forEach((inv) => {
    bump(capitalIn, monthKey(inv.investedAt), inv.amount);
    // A capital return has no date of its own on the investment row, so it is
    // booked against the month it was recorded in.
    if (inv.returnedAmount) bump(capitalOut, monthKey(inv.updatedAt), inv.returnedAmount);
  });
  profitRecords.forEach((rec) => bump(profitIn, monthKey(rec.generatedAt), rec.amount));
  transactions
    .filter((t) => t.type === 'DEBIT' && t.status === 'COMPLETED')
    .forEach((t) => bump(withdrawn, monthKey(t.createdAt), t.amount));

  let capital = breakdown.openingCapital;
  let profit = breakdown.openingProfit;
  let paidOut = 0;

  return months.map((month) => {
    capital += (capitalIn.get(month) || 0) - (capitalOut.get(month) || 0);
    profit += profitIn.get(month) || 0;
    paidOut += withdrawn.get(month) || 0;

    return {
      month,
      capital: money(Math.max(0, capital)),
      profit: money(Math.max(0, profit - paidOut)),
      profitEarned: money(profitIn.get(month) || 0),
      invested: money(capitalIn.get(month) || 0),
      withdrawn: money(withdrawn.get(month) || 0),
      balance: money(Math.max(0, capital + Math.max(0, profit - paidOut))),
    };
  });
}

/** The payload behind both the detail page and the statement email. */
async function buildOverview(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      profile: true,
      kycDocuments: { orderBy: { uploadedAt: 'desc' } },
      membership: true,
    },
  });
  if (!user) return null;

  const [
    breakdown, byProject, investments, profitRecords,
    transactions, withdrawRequests, profitConfigs, investmentRequests,
  ] = await Promise.all([
    walletService.getWalletBreakdown(userId),
    walletService.getProjectBreakdown(userId),
    prisma.walletInvestment.findMany({
      where: { userId },
      include: { project: { select: { id: true, title: true, category: true, status: true } } },
      orderBy: { investedAt: 'desc' },
    }),
    prisma.profitRecord.findMany({
      where: { userId },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { generatedAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.withdrawRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.profitConfig.findMany({
      where: { userId, active: true },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.investmentRequest.findMany({
      where: { userId },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const activeInvestments = investments.filter((i) => i.status === 'ACTIVE');
  const roi = breakdown.investedCapital > 0
    ? money((breakdown.grossProfit / breakdown.investedCapital) * 100)
    : 0;

  const { passwordHash: _omit, ...safeUser } = user;

  return {
    member: safeUser,
    wallet: walletService.presentWallet(user.wallet, breakdown) || breakdown,
    breakdown,
    byProject,
    investments,
    profitRecords,
    transactions,
    withdrawRequests,
    profitConfigs,
    investmentRequests,
    kpis: {
      investedCapital: breakdown.investedCapital,
      grossProfit: breakdown.grossProfit,
      availableProfit: breakdown.availableProfit,
      withdrawnProfit: breakdown.withdrawnProfit,
      pendingWithdrawal: breakdown.pendingWithdrawal,
      totalBalance: breakdown.totalBalance,
      roi,
      projectCount: byProject.filter((p) => p.projectId).length,
      activeInvestments: activeInvestments.length,
      profitCycles: profitRecords.length,
      transactionCount: transactions.length,
      firstInvestmentAt: investments.length
        ? investments[investments.length - 1].investedAt
        : null,
      joinedAt: user.createdAt,
    },
    series: buildMonthlySeries({
      investments, profitRecords, transactions,
      breakdown, joinedAt: user.createdAt,
    }),
    generatedAt: new Date().toISOString(),
  };
}

// ── GET /api/admin/members/:id/overview ───────
const getMemberOverview = async (req, res) => {
  try {
    const overview = await buildOverview(req.params.id);
    if (!overview) return res.status(404).json({ error: 'Member not found' });
    res.json(overview);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/admin/members/:id/send-statement ──
// Emails the member the same statement the admin is looking at. Awaited rather
// than fire-and-forget: the admin pressed a button and needs to know whether it
// actually went out.
const sendMemberStatement = async (req, res) => {
  try {
    const overview = await buildOverview(req.params.id);
    if (!overview) return res.status(404).json({ error: 'Member not found' });
    if (!overview.member.email) return res.status(400).json({ error: 'Member has no email address' });

    await sendMemberStatementEmail({ overview, note: req.body?.note });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        targetId: req.params.id,
        action: 'EMAIL_MEMBER_STATEMENT',
        details: {
          totalBalance: overview.kpis.totalBalance,
          investments: overview.investments.length,
          profitRecords: overview.profitRecords.length,
        },
      },
    }).catch(() => {});

    logActivity({
      type:        'STATEMENT_SENT',
      title:       `Statement sent to ${overview.member.name}`,
      description: overview.member.email,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    overview.member.id,
      targetName:  overview.member.name,
      metadata:    { email: overview.member.email, note: req.body?.note || null },
    });

    res.json({ message: `Statement emailed to ${overview.member.email}.`, sentTo: overview.member.email });
  } catch (err) {
    console.error('member statement email failed:', err);
    res.status(502).json({ error: err.message || 'Could not send the statement email.' });
  }
};

module.exports = { getMemberOverview, sendMemberStatement, buildOverview };
