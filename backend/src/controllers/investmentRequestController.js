// src/controllers/investmentRequestController.js
//
// Investment is admin-controlled. A member can only ASK to invest:
//
//   member clicks Invest Now -> request (no financial effect whatsoever)
//     -> member pays offline by bank transfer
//     -> admin confirms the money arrived
//     -> admin completes the request with the ACTUAL amount received
//     -> only now: capital, wallet, transaction, project total, profit eligibility
//
// The requested amount and the actual amount are deliberately separate: a
// member may request EUR 10,000 and only EUR 8,000 may land, and every later
// calculation must use the 8,000.

const prisma = require('../utils/prismaClient');
const engine = require('../services/investmentEngine');
const walletService = require('../services/walletService');
const mailer = require('../services/mailer');

const requestInclude = {
  user: { select: { id: true, name: true, email: true, profilePhoto: true } },
  project: { select: { id: true, title: true, category: true, status: true, targetAmount: true, raisedAmount: true } },
  investment: { select: { id: true, amount: true, investedAt: true, status: true } },
};

const { logActivity } = require('../services/activityLog');

const fail = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
};

// ── Member ─────────────────────────────────────

const createRequest = async (req, res) => {
  try {
    const { projectId, requestedAmount, message } = req.body;
    const amount = parseFloat(requestedAmount);

    if (!projectId) return res.status(400).json({ error: 'Project is required' });
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Requested amount must be greater than zero' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'This project is not currently accepting investment requests' });
    }

    const request = await prisma.investmentRequest.create({
      data: {
        userId: req.user.id,
        projectId,
        requestedAmount: walletService.money(amount),
        message: message || null,
      },
      include: requestInclude,
    });

    await prisma.notification.create({
      data: {
        userId: project.ownerId,
        type: 'DEAL_UPDATE',
        title: 'New investment request',
        message: `${req.user.name} requested to invest €${amount.toLocaleString()} in ${project.title}`,
        link: `/community/deal-room/detail?id=${project.id}`,
      },
    }).catch(() => {});

    logActivity({
      type:        'INVESTMENT_REQUESTED',
      title:       `${req.user.name} requested to invest in ${project.title}`,
      description: message || undefined,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    req.user.id,
      targetName:  req.user.name,
      amount:      walletService.money(amount),
      metadata:    { requestId: request.id, projectId, projectTitle: project.title },
    });

    res.status(201).json({ request });
  } catch (err) {
    fail(res, err);
  }
};

const getMyRequests = async (req, res) => {
  try {
    const requests = await prisma.investmentRequest.findMany({
      where: { userId: req.user.id },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (err) {
    fail(res, err);
  }
};

const cancelRequest = async (req, res) => {
  try {
    const request = await prisma.investmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only a pending request can be cancelled' });
    }

    const updated = await prisma.investmentRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
      include: requestInclude,
    });
    res.json({ request: updated });
  } catch (err) {
    fail(res, err);
  }
};

// ── Admin ──────────────────────────────────────

const listRequests = async (req, res) => {
  try {
    const { status, userId, projectId, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;

    const [requests, total] = await Promise.all([
      prisma.investmentRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.investmentRequest.count({ where }),
    ]);

    res.json({ requests, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    fail(res, err);
  }
};

const getRequest = async (req, res) => {
  try {
    const request = await prisma.investmentRequest.findUnique({
      where: { id: req.params.id },
      include: requestInclude,
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Wallet impact preview for the confirmation summary.
    const [wallet, projectCapital, monthlyConfig] = await Promise.all([
      walletService.getWalletBreakdown(request.userId),
      engine.getTotalCapital(request.userId, request.projectId),
      engine.getCurrentMonthlyProfitConfig(request.userId, request.projectId),
    ]);

    res.json({ request, wallet, projectCapital, monthlyConfig });
  } catch (err) {
    fail(res, err);
  }
};

/** Mark that the money has been received and the request is cleared to complete. */
const markPaymentReceived = async (req, res) => {
  try {
    const request = await prisma.investmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only a pending request can be marked as received' });
    }

    const updated = await prisma.investmentRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedBy: req.user.id, reviewedAt: new Date() },
      include: requestInclude,
    });

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        targetId: request.userId,
        action: 'INVESTMENT_REQUEST_PAYMENT_RECEIVED',
        details: { requestId: request.id, projectId: request.projectId },
      },
    }).catch(() => {});

    logActivity({
      type:        'INVESTMENT_PAYMENT_RECEIVED',
      title:       `Payment received for ${updated.user?.name}'s request`,
      description: updated.project?.title,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    request.userId,
      targetName:  updated.user?.name,
      amount:      request.requestedAmount,
      metadata:    { requestId: request.id, projectId: request.projectId },
    });

    res.json({ request: updated });
  } catch (err) {
    fail(res, err);
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const request = await prisma.investmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status === 'COMPLETED') {
      return res.status(400).json({ error: 'A completed investment cannot be rejected' });
    }

    const updated = await prisma.investmentRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
      include: requestInclude,
    });

    await prisma.notification.create({
      data: {
        userId: request.userId,
        type: 'DEAL_UPDATE',
        title: 'Investment request declined',
        message: reason || 'Your investment request was not approved.',
        link: '/dashboard',
      },
    }).catch(() => {});

    logActivity({
      type:        'INVESTMENT_REQUEST_REJECTED',
      title:       `Investment request rejected · ${updated.user?.name || ''}`.trim(),
      description: reason || 'No reason given',
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    request.userId,
      targetName:  updated.user?.name,
      amount:      request.requestedAmount,
      metadata:    { requestId: request.id, projectId: request.projectId, reason },
    });

    res.json({ request: updated });
  } catch (err) {
    fail(res, err);
  }
};

/**
 * The only path that turns a request into money. Creates the capital record,
 * its transaction, the project total and the wallet refresh in one transaction
 * so a half-completed investment can never exist.
 */
const completeRequest = async (req, res) => {
  try {
    const { actualAmount, investedAt, description } = req.body;
    const request = await prisma.investmentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This request has already been completed' });
    }
    if (['REJECTED', 'CANCELLED'].includes(request.status)) {
      return res.status(400).json({ error: `A ${request.status.toLowerCase()} request cannot be completed` });
    }

    const amount = parseFloat(actualAmount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Actual investment amount must be greater than zero' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const investment = await engine.createInvestment({
        userId: request.userId,
        projectId: request.projectId,
        amount,
        investedAt,
        description,
        createdBy: req.user.id,
        requestId: request.id,
      }, tx);

      const updated = await tx.investmentRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED',
          actualAmount: walletService.money(amount),
          reviewedBy: request.reviewedBy || req.user.id,
          reviewedAt: request.reviewedAt || new Date(),
          completedAt: new Date(),
        },
        include: requestInclude,
      });

      return { investment, request: updated };
    });

    // Sent here rather than inside the engine: the engine ran as part of the
    // transaction above, so this is the first point the money is committed.
    const member = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true, name: true, email: true,
        profile: { select: { billingAddress: true, businessAddress: true, vatNumber: true, city: true, country: true } },
      },
    });
    if (member?.email) {
      mailer.sendInvestmentInvoiceEmail({
        user: member,
        amount: result.investment.amount,
        projectTitle: result.request.project?.title || null,
        investedAt: result.investment.investedAt,
        investmentId: result.investment.id,
        // Only worth showing when what arrived differs from what was asked for.
        reference: amount !== request.requestedAmount
          ? `Requested € ${Number(request.requestedAmount).toLocaleString('en-IE', { minimumFractionDigits: 2 })}`
          : null,
      }).catch((e) => console.error('investment invoice email failed:', e.message));
    }

    await prisma.adminLog.create({
      data: {
        adminId: req.user.id,
        targetId: request.userId,
        action: 'COMPLETE_INVESTMENT_REQUEST',
        details: {
          requestId: request.id,
          projectId: request.projectId,
          requestedAmount: request.requestedAmount,
          actualAmount: amount,
        },
      },
    }).catch(() => {});

    await prisma.notification.create({
      data: {
        userId: request.userId,
        type: 'DEAL_UPDATE',
        title: 'Investment confirmed',
        message: `Your investment of €${amount.toLocaleString()} has been confirmed and added to your wallet.`,
        link: '/dashboard',
      },
    }).catch(() => {});

    logActivity({
      type:        'INVESTMENT_COMPLETED',
      title:       `Investment completed · ${amount.toLocaleString()}`,
      description: `Requested ${request.requestedAmount.toLocaleString()}, received ${amount.toLocaleString()}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    request.userId,
      amount,
      metadata:    {
        requestId:       request.id,
        projectId:       request.projectId,
        requestedAmount: request.requestedAmount,
        actualAmount:    amount,
      },
    });

    res.json(result);
  } catch (err) {
    fail(res, err);
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  cancelRequest,
  listRequests,
  getRequest,
  markPaymentReceived,
  rejectRequest,
  completeRequest,
};
