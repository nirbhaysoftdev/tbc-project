// src/controllers/investmentController.js
// Admin-facing API for the capital / profit engine: add investment, return
// capital, add one-time profit, configure monthly profit, and read endpoints to
// list/review what was created.
//
// Projects come from the Deal Room (`Project`) - see projectsController. There
// is no separate investment project catalogue, and a project is optional on any
// investment.
const prisma = require('../utils/prismaClient');
const engine = require('../services/investmentEngine');
const walletService = require('../services/walletService');
const { logActivity } = require('../services/activityLog');

// ── Projects ───────────────────────────────────

/**
 * Deal-room projects with the capital actually booked against each, for the
 * admin project picker.
 */
const listProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['ACTIVE', 'FUNDED'] } },
      select: { id: true, title: true, category: true, status: true, targetAmount: true, raisedAmount: true },
      orderBy: { title: 'asc' },
    });

    const withStats = await Promise.all(projects.map(async (p) => {
      const investors = await prisma.walletInvestment.findMany({
        where: { projectId: p.id, status: 'ACTIVE' },
        select: { userId: true, amount: true, returnedAmount: true },
      });
      const totalCapital = walletService.money(
        investors.reduce((sum, i) => sum + Math.max(0, i.amount - (i.returnedAmount || 0)), 0),
      );
      return {
        ...p,
        name: p.title, // the admin picker labels every project by `name`
        totalCapital,
        investorCount: new Set(investors.map((i) => i.userId)).size,
      };
    }));

    res.json({ projects: withStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Investments ────────────────────────────────

const createInvestment = async (req, res) => {
  try {
    const { userId, projectId, amount, investedAt, description } = req.body;
    const investment = await engine.createInvestment({
      userId, projectId, amount, investedAt, description, createdBy: req.user.id,
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id, targetId: userId, action: 'CREATE_INVESTMENT',
        details: { projectId, amount: investment.amount },
      },
    }).catch(() => {});

    logActivity({
      type:        'INVESTMENT_CREATED',
      title:       `Capital booked · ${investment.amount.toLocaleString()}`,
      description: description || undefined,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    userId,
      amount:      investment.amount,
      metadata:    { investmentId: investment.id, projectId: projectId || null },
    });

    res.status(201).json({ investment });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

/** Return capital to a member - the only path that reduces invested capital. */
const returnCapital = async (req, res) => {
  try {
    const { amount, description } = req.body || {};
    const investment = await engine.returnCapital({
      investmentId: req.params.id, amount, description, createdBy: req.user.id,
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id, targetId: investment.userId, action: 'RETURN_CAPITAL',
        details: { investmentId: investment.id, amount, returnedAmount: investment.returnedAmount },
      },
    }).catch(() => {});

    logActivity({
      type:        'CAPITAL_RETURNED',
      title:       `Capital returned · ${Number(amount ?? investment.returnedAmount).toLocaleString()}`,
      description: description || undefined,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    investment.userId,
      amount:      Number(amount ?? investment.returnedAmount),
      metadata:    { investmentId: investment.id, returnedAmount: investment.returnedAmount },
    });

    res.json({ investment });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

const listInvestments = async (req, res) => {
  try {
    const { userId, projectId, status, page = 1, limit = 50 } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const [investments, total] = await Promise.all([
      prisma.walletInvestment.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, project: true },
        orderBy: { investedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.walletInvestment.count({ where }),
    ]);

    res.json({ investments, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Profit ──────────────────────────────────────

const createOneTimeProfit = async (req, res) => {
  try {
    const { userId, projectId, profitType, value, effectiveDate, description } = req.body;
    const record = await engine.createOneTimeProfit({
      userId, projectId, profitType, value, effectiveDate, description, createdBy: req.user.id,
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id, targetId: userId, action: 'CREATE_ONE_TIME_PROFIT',
        details: { projectId, profitType, amount: record.amount },
      },
    }).catch(() => {});

    logActivity({
      type:        'PROFIT_GIVEN',
      title:       `Profit given · ${record.amount.toLocaleString()}`,
      description: description || profitType,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    userId,
      amount:      record.amount,
      metadata:    { profitRecordId: record.id, projectId: projectId || null, profitType, value },
    });

    res.status(201).json({ profitRecord: record });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

const setMonthlyProfitConfig = async (req, res) => {
  try {
    const { userId, projectId, rate, monthlyProfitDay, effectiveFrom } = req.body;
    const config = await engine.setMonthlyProfitConfig({
      userId, projectId, rate, monthlyProfitDay, effectiveFrom, createdBy: req.user.id,
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id, targetId: userId, action: 'SET_MONTHLY_PROFIT_CONFIG',
        details: { projectId, rate: config.rate },
      },
    }).catch(() => {});

    logActivity({
      type:        'PROFIT_CONFIG_SET',
      title:       `Monthly profit set to ${config.rate}%`,
      description: `Effective from ${effectiveFrom}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    userId,
      metadata:    { configId: config.id, projectId: projectId || null, rate: config.rate, monthlyProfitDay },
    });

    res.status(201).json({ config });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

const previewMonthlyProfit = async (req, res) => {
  try {
    const { userId, projectId } = req.query;
    if (!userId || !projectId) return res.status(400).json({ error: 'userId and projectId are required' });
    const preview = await engine.previewMonthlyProfit(userId, projectId);
    res.json({ preview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const listProfitRecords = async (req, res) => {
  try {
    const { userId, projectId, type, page = 1, limit = 50 } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;
    if (type) where.type = type;

    const [records, total] = await Promise.all([
      prisma.profitRecord.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, project: true },
        orderBy: { generatedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.profitRecord.count({ where }),
    ]);

    res.json({ records, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Manual trigger (cron wiring comes in a later slice) ──
const runMonthlyGeneration = async (req, res) => {
  try {
    const { periodDate } = req.body || {};
    const result = await engine.generateMonthlyProfitsForPeriod(
      periodDate ? new Date(periodDate) : new Date(),
      req.user.id,
    );

    logActivity({
      type:        'PROFIT_MONTHLY_GENERATED',
      title:       `Monthly profit run · ${result.generated} generated, ${result.skipped} skipped`,
      description: `Period ${result.period}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { period: result.period, generated: result.generated, skipped: result.skipped },
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  listProjects,
  createInvestment, listInvestments, returnCapital,
  createOneTimeProfit, setMonthlyProfitConfig, previewMonthlyProfit, listProfitRecords,
  runMonthlyGeneration,
};
