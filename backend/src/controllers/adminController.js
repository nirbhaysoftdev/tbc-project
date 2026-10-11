// src/controllers/adminController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../utils/prismaClient'); // Prisma 7 - uses adapter-pg singleton
const walletService = require('../services/walletService');
const {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendMemberWelcomeEmail,
  sendWalletActivatedEmail,
} = require('../services/mailer');
const { logActivity } = require('../services/activityLog');

// ── Generate a readable temporary password ─────
function generateTempPassword() {
  // e.g. "Tbc-7f3a9c2e" - meets the app's min-length password rules
  return `Tbc-${crypto.randomBytes(6).toString('hex')}`;
}

const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1;

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
        include: { wallet: true, kycDocuments: true },
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    // The stored wallet row only holds the manual opening balance, so capital
    // and profit have to be derived from the ledger before they go out.
    const breakdowns = await walletService.getWalletBreakdownsFor(members.map((m) => m.id));
    const safeMembers = members.map(({ passwordHash, ...m }) => ({
      ...m,
      wallet: walletService.presentWallet(m.wallet, breakdowns.get(m.id)),
    }));

    res.json({ members: safeMembers, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create member (multi-step: type -> details/docs -> wallet) ──
const createMember = async (req, res) => {
  try {
    const {
      memberType,            // 'COMPANY' | 'PERSONAL'
      email,
      mobile,
      mobileCountry,
      mobileDialCode,
      companyName,
      fullName,
      city,
      country,
      enableWallet = false,
      investmentAmount = 0,
      profitAmount = 0,
    } = req.body;

    const isCompany = memberType === 'COMPANY';
    const isPersonal = memberType === 'PERSONAL';
    if (!isCompany && !isPersonal) {
      return res.status(400).json({ error: 'Member type must be COMPANY or PERSONAL' });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!mobile || !String(mobile).trim()) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }
    if (!city || !String(city).trim())       return res.status(400).json({ error: 'City is required' });
    if (!country || !String(country).trim()) return res.status(400).json({ error: 'Country is required' });

    const files = req.files || {};
    const photoFile       = files.photo?.[0];
    const tradeLicenseFile = files.tradeLicense?.[0];
    const passportFile    = files.passport?.[0];
    const residentIdFile  = files.residentId?.[0];

    let name;
    if (isCompany) {
      if (!companyName || !String(companyName).trim()) {
        return res.status(400).json({ error: 'Company name is required' });
      }
      if (!tradeLicenseFile) {
        return res.status(400).json({ error: 'Company trade licence / registration certificate is required' });
      }
      name = companyName.trim();
    } else {
      if (!fullName || !String(fullName).trim()) {
        return res.status(400).json({ error: 'Full name is required' });
      }
      if (!residentIdFile) {
        return res.status(400).json({ error: 'Resident ID card is required' });
      }
      name = fullName.trim();
    }

    const normEmail = String(email).toLowerCase().trim();
    const walletOn  = truthy(enableWallet);

    const existing = await prisma.user.findUnique({ where: { email: normEmail } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const inv   = parseFloat(investmentAmount) || 0;
    const prof  = parseFloat(profitAmount)     || 0;
    const total = inv + prof;

    const profileData = {
      company:         isCompany ? companyName.trim() : null,
      city:            city.trim(),
      country:         country.trim(),
      phone:           mobile.trim(),
      phoneCountry:    mobileCountry   || null,
      phoneDialCode:   mobileDialCode  || null,
      tradeLicenseUrl: tradeLicenseFile ? `/uploads/${tradeLicenseFile.filename}` : null,
      residentIdUrl:   residentIdFile   ? `/uploads/${residentIdFile.filename}`   : null,
      passportUrl:     passportFile     ? `/uploads/${passportFile.filename}`     : null,
    };

    const user = await prisma.user.create({
      data: {
        name,
        email: normEmail,
        passwordHash,
        profilePhoto:   photoFile ? `/uploads/${photoFile.filename}` : null,
        role:           'MEMBER',
        status:         'ACTIVE',
        kycStatus:      'NOT_SUBMITTED',
        emailVerified:  true,
        accountType:    isCompany ? 'BUSINESS' : 'PROFESSIONAL',
        walletEnabled:  walletOn,
        profile:        { create: profileData },
        ...(walletOn && {
          wallet: {
            create: { investmentAmount: inv, profitAmount: prof, totalBalance: total },
          },
        }),
      },
      include: { wallet: true, profile: true },
    });

    // Log action (never log the password)
    await prisma.adminLog.create({
      data: {
        adminId:  req.user.id,
        targetId: user.id,
        action:   'CREATE_MEMBER',
        details:  { name, email: normEmail, memberType, walletEnabled: walletOn },
      },
    });

    logActivity({
      type:        'MEMBER_CREATED',
      title:       `Member created: ${user.name}`,
      description: `${normEmail} · ${memberType} · wallet ${walletOn ? 'enabled' : 'disabled'}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    user.id,
      targetName:  user.name,
      amount:      total || null,
      metadata:    { email: normEmail, memberType, walletEnabled: walletOn },
    });

    sendMemberWelcomeEmail(user, tempPassword, walletOn)
      .catch((e) => console.error('member welcome email failed:', e.message));

    // A member created with money already in the wallet gets the balance in
    // writing too. With an empty wallet the welcome email above already says
    // it is enabled, so there is nothing to add.
    if (walletOn && total > 0) {
      walletService.getWalletBreakdown(user.id)
        .then((breakdown) => sendWalletActivatedEmail({ user, breakdown }))
        .catch((e) => console.error('wallet activation email failed:', e.message));
    }

    const { passwordHash: _omit, ...safeUser } = user;
    res.status(201).json({ user: safeUser, message: 'Member created and welcome email sent.' });
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
    const { passwordHash: _ph, ...rest } = user;
    const safeUser = {
      ...rest,
      wallet: walletService.presentWallet(user.wallet, await walletService.getWalletBreakdown(id)),
    };

    await prisma.adminLog.create({
      data: { adminId: req.user.id, targetId: id, action: 'UPDATE_MEMBER' },
    });

    logActivity({
      type:       'MEMBER_UPDATED',
      title:      `Member updated: ${user.name}`,
      description: Object.keys(updateData)
        .map((k) => (k === 'passwordHash' ? 'password' : k)).join(', ') || 'no changes',
      actorId:    req.user.id,
      actorName:  req.user.name,
      targetId:   id,
      targetName: user.name,
    });

    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete member ─────────────────────────────
const deleteMember = async (req, res) => {
  try {
    // Read the name first: once the row is gone the log line has nothing to
    // show (the FK is SET NULL on delete).
    const victim = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { name: true, email: true },
    });
    await prisma.user.delete({ where: { id: req.params.id } });

    logActivity({
      type:        'MEMBER_DELETED',
      title:       `Member deleted: ${victim?.name || req.params.id}`,
      description: victim?.email,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetName:  victim?.name,
      metadata:    { deletedUserId: req.params.id, email: victim?.email },
    });

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

    logActivity({
      type:       frozen ? 'MEMBER_FROZEN' : 'MEMBER_UNFROZEN',
      title:      `${frozen ? 'Froze' : 'Unfroze'} ${user.name}`,
      actorId:    req.user.id,
      actorName:  req.user.name,
      targetId:   req.params.id,
      targetName: user.name,
    });

    res.json({ frozen, message: frozen ? 'Account frozen' : 'Account unfrozen' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update wallet opening balance ─────────────
// LEGACY MANUAL PATH. Production balances were all created this way, with no
// project behind them, so this stays supported. It writes only the manual
// OPENING BALANCE - any project investment the member also has is derived on
// top of it by walletService and is unaffected here.
//
// New money should go through the investment request / project engine instead;
// admin migrates members off the opening balance one at a time.
const updateWallet = async (req, res) => {
  try {
    const { investmentAmount, profitAmount } = req.body;
    const inv   = parseFloat(investmentAmount);
    const prof  = parseFloat(profitAmount);

    // Whether this call is the one that switches the wallet on decides whether
    // the member gets told. Editing an already-live opening balance is a
    // correction, not news, so it stays silent.
    const before = await prisma.user.findUnique({
      where:  { id: req.params.id },
      select: { id: true, name: true, email: true, walletEnabled: true },
    });
    if (!before) return res.status(404).json({ error: 'Member not found' });
    const isActivation = !before.walletEnabled;

    const wallet = await prisma.$transaction(async (tx) => {
      const saved = await tx.wallet.upsert({
        where:  { userId: req.params.id },
        update: { investmentAmount: inv, profitAmount: prof },
        create: { userId: req.params.id, investmentAmount: inv, profitAmount: prof },
      });
      await tx.user.update({
        where: { id: req.params.id },
        data:  { walletEnabled: true },
      });
      await walletService.syncWallet(req.params.id, tx);
      return saved;
    });

    const breakdown = await walletService.getWalletBreakdown(req.params.id);
    const total = breakdown.totalBalance;

    await prisma.adminLog.create({
      data: {
        adminId:  req.user.id,
        targetId: req.params.id,
        action:   isActivation ? 'ENABLE_WALLET' : 'UPDATE_WALLET',
        details:  { investmentAmount: inv, profitAmount: prof, totalBalance: total },
      },
    });

    logActivity({
      type:        isActivation ? 'WALLET_ACTIVATED' : 'WALLET_UPDATED',
      title:       `${isActivation ? 'Wallet activated' : 'Wallet updated'}: ${before?.name || ''}`.trim(),
      description: `Opening capital ${inv}, opening profit ${prof}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    req.params.id,
      targetName:  before?.name,
      amount:      total,
      metadata:    { investmentAmount: inv, profitAmount: prof, totalBalance: total },
    });

    // Fire and forget: a mail failure must never roll back the activation.
    if (isActivation) {
      sendWalletActivatedEmail({ user: before, breakdown })
        .catch((e) => console.error('wallet activation email failed:', e.message));
    }

    res.json({ wallet, walletActivated: isActivation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Add manual transaction ────────────────────
// LEGACY MANUAL PATH, kept because production depends on it. It adjusts the
// manual OPENING BALANCE and records a matching transaction.
//
// INVESTMENT and PROFIT are deliberately NOT accepted here any more: those must
// come from the project engine (investment request -> capital -> profit) so
// money is always traceable to an investment record. What remains is the
// correction/adjustment path and withdrawals booked outside the request flow.
const addTransaction = async (req, res) => {
  try {
    const { userId, category, description, amount } = req.body;
    const amt = parseFloat(amount);

    const allowed = ['WITHDRAWAL', 'ADMIN_CREDIT', 'ADMIN_DEBIT'];
    if (!allowed.includes(category)) {
      return res.status(400).json({
        error: 'Only WITHDRAWAL, ADMIN_CREDIT and ADMIN_DEBIT can be booked manually. '
             + 'Record investments and profit through the investment engine so they stay linked to a project.',
      });
    }
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const isDebit = category === 'WITHDRAWAL' || category === 'ADMIN_DEBIT';

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

      if (isDebit) {
        // Debits come out of profit; invested capital is returned through the
        // investment engine, never drained by a manual adjustment.
        const breakdown = await walletService.getWalletBreakdown(userId, tx);
        if (amt > breakdown.availableProfit) {
          throw Object.assign(
            new Error(`Amount exceeds available profit of ${breakdown.availableProfit}`),
            { status: 400 },
          );
        }
        await tx.wallet.update({
          where: { userId },
          data: { withdrawnProfit: { increment: walletService.money(amt) } },
        });
      } else {
        await tx.wallet.update({
          where: { userId },
          data: { profitAmount: { increment: walletService.money(amt) } },
        });
      }

      const breakdown = await walletService.syncWallet(userId, tx);

      return tx.transaction.create({
        data: {
          userId,
          type: isDebit ? 'DEBIT' : 'CREDIT',
          category,
          amount: walletService.money(amt),
          balanceAfter: breakdown.totalBalance,
          description,
          createdBy: req.user.id,
        },
      });
    });

    logActivity({
      type:        'TRANSACTION_ADDED',
      title:       `${isDebit ? 'Debit' : 'Credit'} ${walletService.money(amt)} · ${category}`,
      description,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    userId,
      amount:      walletService.money(amt),
      metadata:    { category, type: isDebit ? 'DEBIT' : 'CREDIT', transactionId: result.id },
    });

    res.status(201).json({ transaction: result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  }
};

// ── Pending-action counts for the admin notification badge ────
// One cheap call that the sidebar/topbar poll. Each number is work that is
// sitting in a queue waiting on an admin, so a zero means "nothing to do".
const getNotificationCounts = async (req, res) => {
  try {
    const [newMembers, investmentRequests, withdrawRequests] = await Promise.all([
      prisma.user.count({ where: { role: 'MEMBER', status: 'PENDING' } }),
      prisma.investmentRequest.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
      prisma.withdrawRequest.count({ where: { status: 'PENDING' } }),
    ]);

    res.json({
      newMembers,
      investmentRequests,
      withdrawRequests,
      total: newMembers + investmentRequests + withdrawRequests,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Admin stats ───────────────────────────────
const getStats = async (req, res) => {
  try {
    const [totalMembers, pendingApprovals, walletUsers, transactions] = await Promise.all([
      prisma.user.count({ where: { role: 'MEMBER', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'MEMBER', status: 'PENDING' } }),
      prisma.wallet.findMany({ select: { userId: true } }),
      prisma.transaction.count({ where: { status: 'COMPLETED' } }),
    ]);

    // AUM is opening balance + project capital, so it has to come from the
    // ledger rather than a sum over the stored wallet columns.
    const breakdowns = await walletService.getWalletBreakdownsFor(walletUsers.map((w) => w.userId));
    const totals = [...breakdowns.values()].reduce((acc, b) => ({
      aum: acc.aum + b.investedCapital,
      profit: acc.profit + b.grossProfit,
      balance: acc.balance + b.totalBalance,
    }), { aum: 0, profit: 0, balance: 0 });

    res.json({
      totalMembers,
      pendingApprovals,
      totalAUM:              walletService.money(totals.aum),
      totalProfitDistributed: walletService.money(totals.profit),
      totalBalance:          walletService.money(totals.balance),
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

    const breakdowns = await walletService.getWalletBreakdownsFor(members.map((m) => m.id));

    const header = 'Name,Email,Status,Invested Capital,Available Profit,Pending Withdrawal,Withdrawn Profit,Balance,Joined\n';
    const rows   = members.map(m => {
      const b = breakdowns.get(m.id);
      return `"${m.name}","${m.email}",${m.status},${b?.investedCapital || 0},${b?.availableProfit || 0},`
           + `${b?.pendingWithdrawal || 0},${b?.withdrawnProfit || 0},${b?.totalBalance || 0},${m.createdAt.toISOString()}`;
    }).join('\n');

    logActivity({
      type:        'DATA_EXPORTED',
      title:       `Member CSV exported (${members.length} members)`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { memberCount: members.length },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="TBC-Members-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get pending applicants ─────────────────────
const getPendingUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const where = { role: 'MEMBER', status: 'PENDING' };
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { profile: true, kycDocuments: true },
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    const safeUsers = users.map(({ passwordHash, ...u }) => u);
    res.json({ users: safeUsers, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Approve user (full MMS activation) ────────
const approveUser = async (req, res) => {
  const { id } = req.params;
  const { enableWallet = true } = req.body;
  const walletOn = truthy(enableWallet);

  let documentTypes = [];
  try {
    documentTypes = req.body.documentTypes ? JSON.parse(req.body.documentTypes) : [];
  } catch { documentTypes = []; }

  const newDocs = (req.files || []).map((file, i) => ({
    userId:       id,
    documentType: documentTypes[i] || 'id_proof',
    documentUrl:  `/uploads/kyc/${file.filename}`,
    status:       'approved',
  }));

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'ACTIVE') return res.status(400).json({ error: 'User is already active' });

    await prisma.$transaction(async (tx) => {
      // 1. Activate user
      await tx.user.update({
        where: { id },
        data: {
          status:        'ACTIVE',
          kycStatus:     'APPROVED',
          walletEnabled: walletOn,
        },
      });

      // 2. Approve all existing pending KYC docs, and store any newly uploaded ones
      await tx.kycDocument.updateMany({
        where: { userId: id, status: 'pending' },
        data:  { status: 'approved' },
      });
      if (newDocs.length) {
        await tx.kycDocument.createMany({ data: newDocs });
      }

      // 3. Create wallet if enabled and not already present
      if (walletOn) {
        const existingWallet = await tx.wallet.findUnique({ where: { userId: id } });
        if (!existingWallet) {
          await tx.wallet.create({ data: { userId: id } });
        }
      }

      // 4. Create membership record
      const existingMembership = await tx.membership.findUnique({ where: { userId: id } });
      if (!existingMembership) {
        await tx.membership.create({
          data: { userId: id, status: 'ACTIVE' },
        });
      } else {
        await tx.membership.update({
          where: { userId: id },
          data:  { status: 'ACTIVE' },
        });
      }

      // 5. Audit log
      await tx.adminLog.create({
        data: {
          adminId:  req.user.id,
          targetId: id,
          action:   'APPROVE_USER',
          details:  { walletEnabled: walletOn, documentsAdded: newDocs.length },
        },
      });
    });

    logActivity({
      type:        'MEMBER_APPROVED',
      title:       `Member approved: ${user.name}`,
      description: `${user.email} · wallet ${walletOn ? 'enabled' : 'not enabled'} · ${newDocs.length} document(s) added`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { walletEnabled: walletOn, documentsAdded: newDocs.length },
    });

    sendAccountApprovedEmail(user, walletOn)
      .catch((e) => console.error('approval email failed:', e.message));

    res.json({
      message: `Member activated successfully.${walletOn ? ' Wallet enabled.' : ''}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Reject user ────────────────────────────────
const rejectUser = async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({
      where: { id },
      data:  { status: 'REJECTED' },
    });

    await prisma.adminLog.create({
      data: {
        adminId:  req.user.id,
        targetId: id,
        action:   'REJECT_USER',
        details:  { reason },
      },
    });

    logActivity({
      type:        'MEMBER_REJECTED',
      title:       `Member rejected: ${user.name}`,
      description: reason || 'No reason given',
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { reason },
    });

    sendAccountRejectedEmail(user, reason)
      .catch((e) => console.error('rejection email failed:', e.message));

    res.json({ message: 'User application rejected.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getMembers, createMember, updateMember, deleteMember,
  toggleFreeze, updateWallet, addTransaction, getStats, exportData,
  getNotificationCounts,
  getPendingUsers, approveUser, rejectUser,
};
