// src/controllers/projectsController.js
const prisma = require('../utils/prismaClient');

// ── Get all projects (Deal Room) ──────────────
const getProjects = async (req, res) => {
  try {
    const { status, category, riskLevel, page = 1, limit = 12 } = req.query;
    const where = {};
    if (status)    where.status    = status;
    if (category)  where.category  = category;
    if (riskLevel) where.riskLevel = riskLevel;

    // Default: show only ACTIVE (public deal room view)
    if (!status) where.status = 'ACTIVE';

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, profilePhoto: true, membershipTier: true } },
          _count: { select: { investments: true } },
          investments: {
            where: { investorId: req.user.id },
            select: { id: true, amount: true, sharePercentage: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.project.count({ where }),
    ]);

    const enriched = projects.map(p => ({
      ...p,
      fundingPct:      p.targetAmount > 0 ? Math.round((p.raisedAmount / p.targetAmount) * 100) : 0,
      investorCount:   p._count.investments,
      myInvestment:    p.investments[0] || null,
      investments:     undefined,
      _count:          undefined,
    }));

    res.json({ projects: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get single project ────────────────────────
const getProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        owner: {
          select: { id: true, name: true, profilePhoto: true, membershipTier: true,
                    profile: { select: { company: true, country: true } } },
        },
        documents:   true,
        milestones:  { orderBy: { targetDate: 'asc' } },
        investments: {
          include: {
            investor: { select: { id: true, name: true, profilePhoto: true } },
          },
        },
        _count: { select: { investments: true } },
      },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json({
      project: {
        ...project,
        fundingPct:    project.targetAmount > 0 ? Math.round((project.raisedAmount / project.targetAmount) * 100) : 0,
        investorCount: project._count.investments,
        _count:        undefined,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create project ────────────────────────────
const createProject = async (req, res) => {
  try {
    const {
      title, description, category,
      targetAmount, minInvestmentPct, shareType,
      riskLevel, fundingDeadline, targetIRR, location,
    } = req.body;

    if (!title || !description || !category || !targetAmount || !fundingDeadline) {
      return res.status(400).json({ error: 'title, description, category, targetAmount, fundingDeadline are required' });
    }

    const deadline = new Date(fundingDeadline);

    const project = await prisma.project.create({
      data: {
        ownerId:         req.user.id,
        title,
        description,
        category,
        targetAmount:    parseFloat(targetAmount),
        minInvestmentPct: minInvestmentPct ? parseFloat(minInvestmentPct) : 5,
        shareType:       shareType   || 'LIMITED',
        riskLevel:       riskLevel   || 'MEDIUM',
        fundingDeadline: deadline,
        targetIRR:       targetIRR   ? parseFloat(targetIRR) : null,
        location:        location    || null,
        status:          'ACTIVE',
      },
      include: {
        owner: { select: { id: true, name: true, profilePhoto: true } },
      },
    });

    res.status(201).json({ project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update project ────────────────────────────
const updateProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const allowed = ['title','description','category','riskLevel','targetIRR','location','status','imageUrl'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    const updated = await prisma.project.update({ where: { id: req.params.id }, data });
    res.json({ project: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Invest in a project ───────────────────────
const invest = async (req, res) => {
  try {
    const { amount, notes } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== 'ACTIVE') return res.status(400).json({ error: 'Project is not accepting investments' });

    const investAmt      = parseFloat(amount);
    const sharePercentage = (investAmt / project.targetAmount) * 100;

    if (sharePercentage < project.minInvestmentPct) {
      return res.status(400).json({
        error: `Minimum investment is ${project.minInvestmentPct}% (€${(project.targetAmount * project.minInvestmentPct / 100).toLocaleString()})`,
      });
    }

    const newRaised = project.raisedAmount + investAmt;
    if (newRaised > project.targetAmount) {
      return res.status(400).json({ error: 'Investment exceeds remaining funding target' });
    }

    const [investment] = await prisma.$transaction([
      prisma.investment.create({
        data: {
          projectId:      project.id,
          investorId:     req.user.id,
          amount:         investAmt,
          sharePercentage,
          status:         'CONFIRMED',
          notes:          notes || null,
        },
      }),
      prisma.project.update({
        where: { id: project.id },
        data:  {
          raisedAmount: newRaised,
          status:       newRaised >= project.targetAmount ? 'FUNDED' : 'ACTIVE',
        },
      }),
    ]);

    // Notify project owner
    await prisma.notification.create({
      data: {
        userId:  project.ownerId,
        type:    'DEAL_UPDATE',
        title:   'New investment',
        message: `${req.user.name} invested €${investAmt.toLocaleString()} in ${project.title}`,
        link:    `/community/deal-room/${project.id}`,
      },
    });

    res.status(201).json({ investment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Add milestone ─────────────────────────────
const addMilestone = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, targetDate, amount } = req.body;
    if (!title || !targetDate || !amount) {
      return res.status(400).json({ error: 'title, targetDate, amount are required' });
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId:   req.params.id,
        title,
        description: description || null,
        targetDate:  new Date(targetDate),
        amount:      parseFloat(amount),
      },
    });

    res.status(201).json({ milestone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete project ────────────────────────────
const deleteProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── My investments ────────────────────────────
const getMyInvestments = async (req, res) => {
  try {
    const investments = await prisma.investment.findMany({
      where:   { investorId: req.user.id },
      include: {
        project: {
          select: {
            id: true, title: true, category: true, status: true,
            targetAmount: true, raisedAmount: true, targetIRR: true,
            fundingDeadline: true, imageUrl: true,
            owner: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { investedAt: 'desc' },
    });
    res.json({ investments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getProjects, getProject, createProject, updateProject, deleteProject, invest, addMilestone, getMyInvestments };
