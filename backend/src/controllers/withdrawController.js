// src/controllers/withdrawController.js
//
// Members withdraw PROFIT ONLY - invested capital is never withdrawable here.
// Returning capital is an admin action (see investmentEngine.returnCapital).
//
// A pending request RESERVES its amount: the money moves from availableProfit
// into pendingWithdrawal straight away, so the same profit cannot be requested
// twice while an earlier request is still being reviewed.
//
//   request  -> availableProfit down, pendingWithdrawal up
//   approve  -> pendingWithdrawal down, withdrawnProfit up, DEBIT transaction
//   reject   -> pendingWithdrawal down, availableProfit restored
const prisma = require('../utils/prismaClient');
const walletService = require('../services/walletService');
const mailer = require('../services/mailer');
const { logActivity } = require('../services/activityLog');

// Member submits withdrawal request
const createRequest = async (req, res) => {
  try {
    const {
      firstName, lastName, companyName,
      bankName, iban, swiftNumber,
      address, amount, reason,
    } = req.body;

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.frozen) return res.status(403).json({ error: 'This wallet is frozen' });

    const breakdown = await walletService.getWalletBreakdown(req.user.id);
    if (amt > breakdown.availableProfit) {
      return res.status(400).json({
        error: `Amount exceeds your available profit of €${breakdown.availableProfit.toLocaleString()}. Invested capital cannot be withdrawn.`,
      });
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.withdrawRequest.create({
        data: {
          userId:      req.user.id,
          firstName,   lastName,
          companyName, bankName,
          iban,        swiftNumber,
          address,     reason,
          amount:      walletService.money(amt),
        },
      });

      // Reserve the profit against this request.
      await tx.wallet.update({
        where: { userId: req.user.id },
        data: { pendingWithdrawal: { increment: walletService.money(amt) } },
      });

      await walletService.syncWallet(req.user.id, tx);
      return created;
    });

    logActivity({
      type:        'WITHDRAWAL_REQUESTED',
      title:       `Withdrawal requested by ${req.user.name}`,
      description: `${reason || 'No reason given'} · ${bankName} ${iban}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    req.user.id,
      targetName:  req.user.name,
      amount:      walletService.money(amt),
      metadata:    { requestId: request.id, bankName, iban, companyName },
    });

    res.status(201).json({ request });
  } catch (err) {
    console.error('Withdraw create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Member gets their own requests
const getMyRequests = async (req, res) => {
  try {
    const requests = await prisma.withdrawRequest.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin gets all requests
const getAllRequests = async (req, res) => {
  try {
    const requests = await prisma.withdrawRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Settle a reservation: the reserved profit becomes withdrawn profit and a
 * DEBIT transaction records it. Capital is never touched.
 */
const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await prisma.withdrawRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

      // Requests raised before reservations existed have nothing reserved, so
      // clamp rather than letting the bucket go negative.
      const released = Math.min(wallet.pendingWithdrawal, request.amount);

      await tx.wallet.update({
        where: { userId: request.userId },
        data: {
          pendingWithdrawal: walletService.money(wallet.pendingWithdrawal - released),
          withdrawnProfit: { increment: request.amount },
        },
      });

      await tx.withdrawRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      const breakdown = await walletService.syncWallet(request.userId, tx);

      await tx.transaction.create({
        data: {
          userId: request.userId,
          type: 'DEBIT',
          category: 'WITHDRAWAL',
          amount: request.amount,
          balanceAfter: breakdown.totalBalance,
          description: `Withdrawal - ${request.reason}`,
          status: 'COMPLETED',
          createdBy: req.user.id,
        },
      });
    });

    logActivity({
      type:        'WITHDRAWAL_APPROVED',
      title:       `Withdrawal done · ${request.firstName} ${request.lastName}`,
      description: `${request.reason || ''} · paid to ${request.bankName}`.trim(),
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    request.userId,
      amount:      request.amount,
      metadata:    { requestId: id, bankName: request.bankName, iban: request.iban },
    });

    // After commit, confirm to the member. Fire and forget - a mail failure
    // must not make an approved withdrawal look failed.
    prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true, name: true, email: true,
        profile: { select: { billingAddress: true, businessAddress: true, vatNumber: true, city: true, country: true } },
      },
    }).then(async (member) => {
      if (!member?.email) return;
      const breakdown = await walletService.getWalletBreakdown(request.userId);
      await mailer.sendWithdrawalConfirmationEmail({
        user: member,
        amount: request.amount,
        bankName: request.bankName,
        iban: request.iban,
        approvedAt: new Date(),
        requestId: request.id,
        availableProfit: breakdown.availableProfit,
      });
    }).catch((e) => console.error('withdrawal confirmation email failed:', e.message));

    res.json({ message: 'Request approved and balance updated' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
  }
};

// Admin rejects request - the reservation goes back to available profit
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.withdrawRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
      if (wallet) {
        await tx.wallet.update({
          where: { userId: request.userId },
          data: {
            pendingWithdrawal: walletService.money(
              Math.max(0, wallet.pendingWithdrawal - request.amount),
            ),
          },
        });
      }

      await tx.withdrawRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      await walletService.syncWallet(request.userId, tx);
    });

    logActivity({
      type:        'WITHDRAWAL_REJECTED',
      title:       `Withdrawal rejected · ${request.firstName} ${request.lastName}`,
      description: request.reason || undefined,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    request.userId,
      amount:      request.amount,
      metadata:    { requestId: id },
    });

    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createRequest, getMyRequests, getAllRequests, approveRequest, rejectRequest };
