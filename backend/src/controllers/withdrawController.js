// src/controllers/withdrawController.js
const prisma = require('../utils/prismaClient');

// Member submits withdrawal request
const createRequest = async (req, res) => {
  try {
    const {
      firstName, lastName, companyName,
      bankName, iban, swiftNumber,
      address, amount, reason,
    } = req.body;

    // Validate amount against balance
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (parseFloat(amount) > wallet.totalBalance) {
      return res.status(400).json({ error: 'Amount exceeds available balance' });
    }
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const request = await prisma.withdrawRequest.create({
      data: {
        userId:      req.user.id,
        firstName,   lastName,
        companyName, bankName,
        iban,        swiftNumber,
        address,     reason,
        amount:      parseFloat(amount),
      },
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

// Admin approves request — debits balance
const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await prisma.withdrawRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // Debit wallet
    const wallet = await prisma.wallet.findUnique({ where: { userId: request.userId } });
    if (wallet.totalBalance < request.amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const newTotal      = wallet.totalBalance     - request.amount;
    const newInvestment = wallet.investmentAmount  - request.amount > 0
      ? wallet.investmentAmount - request.amount : 0;
    const newProfit     = wallet.profitAmount      - request.amount > 0
      ? wallet.profitAmount     - request.amount : 0;

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: request.userId },
        data:  {
          totalBalance:     newTotal,
          investmentAmount: newInvestment,
          profitAmount:     newProfit,
        },
      }),
      prisma.withdrawRequest.update({
        where: { id },
        data:  { status: 'APPROVED' },
      }),
      prisma.transaction.create({
        data: {
          userId:      request.userId,
          type:        'DEBIT',
          description: `Withdrawal - ${request.reason}`,
          amount:      request.amount,
          status:      'COMPLETED',
        },
      }),
    ]);

    res.json({ message: 'Request approved and balance updated' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin rejects request
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.withdrawRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already processed' });
    }
    await prisma.withdrawRequest.update({
      where: { id },
      data:  { status: 'REJECTED' },
    });
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createRequest, getMyRequests, getAllRequests, approveRequest, rejectRequest };