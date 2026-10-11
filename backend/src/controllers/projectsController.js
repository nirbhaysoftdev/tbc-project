// src/controllers/projectsController.js
const fs = require('fs');
const path = require('path');
const prisma = require('../utils/prismaClient');
const { logActivity } = require('../services/activityLog');
const mediaCtrl = require('./projectMediaController');
const investmentRequestController = require('./investmentRequestController');

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
          owner: { select: { id: true, name: true, profilePhoto: true } },
          _count: { select: { investments: true } },
          investments: {
            where: { investorId: req.user.id },
            select: { id: true, amount: true, sharePercentage: true },
          },
          walletInvestments: {
            where: { userId: req.user.id, status: 'ACTIVE' },
            select: { id: true, amount: true, returnedAmount: true, investedAt: true },
          },
          investmentRequests: {
            where: { userId: req.user.id, status: { in: ['PENDING', 'APPROVED'] } },
            select: { id: true, requestedAmount: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
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
      myCapital:       p.walletInvestments.reduce((s, i) => s + Math.max(0, i.amount - (i.returnedAmount || 0)), 0),
      myPendingRequest: p.investmentRequests[0] || null,
      investments:     undefined,
      walletInvestments: undefined,
      investmentRequests: undefined,
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
          select: { id: true, name: true, profilePhoto: true,
                    profile: { select: { company: true, country: true } } },
        },
        // Media metadata only. The stored path never leaves the server, and
        // viewable URLs come from GET /projects/:id/media, which mints a
        // short-lived ticket per document. See projectMediaController.
        documents: {
          select: { id: true, name: true, type: true, kind: true,
                    mimeType: true, sizeBytes: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
        milestones:  { orderBy: { targetDate: 'asc' } },
        investments: {
          include: {
            investor: { select: { id: true, name: true, profilePhoto: true } },
          },
        },
        walletInvestments: {
          where: { userId: req.user.id, status: 'ACTIVE' },
          select: { id: true, amount: true, returnedAmount: true, investedAt: true },
        },
        investmentRequests: {
          where: { userId: req.user.id, status: { in: ['PENDING', 'APPROVED'] } },
          select: { id: true, requestedAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
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
        myCapital:     project.walletInvestments.reduce((s, i) => s + Math.max(0, i.amount - (i.returnedAmount || 0)), 0),
        myPendingRequest: project.investmentRequests[0] || null,
        walletInvestments: undefined,
        investmentRequests: undefined,
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

    logActivity({
      type:        'PROJECT_CREATED',
      title:       `Project created: ${project.title}`,
      description: `${project.category} · target ${project.targetAmount.toLocaleString()}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      amount:      project.targetAmount,
      metadata:    { projectId: project.id, category: project.category, riskLevel: project.riskLevel },
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
// Members cannot move money themselves: "Invest Now" raises an investment
// request, the member pays offline, and an admin completes it with the actual
// amount received. See investmentRequestController.
const invest = async (req, res) => {
  const { amount, notes, message } = req.body;
  req.body = { projectId: req.params.id, requestedAmount: amount, message: message || notes };
  return investmentRequestController.createRequest(req, res);
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

    // project_documents cascades in the database, which would strand the files
    // themselves on disk, so collect the paths before the rows disappear.
    const documents = await prisma.projectDocument.findMany({
      where:  { projectId: project.id },
      select: { fileUrl: true },
    });

    await prisma.project.delete({ where: { id: req.params.id } });

    documents.forEach((d) => {
      fs.unlink(path.join(mediaCtrl.MEDIA_DIR, path.basename(d.fileUrl)), () => {});
    });

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
