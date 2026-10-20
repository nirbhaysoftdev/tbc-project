// src/controllers/superAdminAssetsController.js
//
// The super-admin actions that are not about a user record: identity documents
// held on a member's behalf, forced deletion and ownership transfer of projects
// and companies, content removal, and ledger reversal.
//
// Document note: everything here writes to `uploads/` and is reached through
// `routes/uploads.js` + `services/fileAccess.js`. These are files ABOUT A
// PERSON, readable only by them and an admin, so they must never go near the
// ticketed media endpoints — those are readable by any member who can open the
// project or company page. See the two tables in CLAUDE.md.

const fs   = require('fs');
const path = require('path');

const prisma        = require('../utils/prismaClient');
const walletService = require('../services/walletService');
const { logActivity }  = require('../services/activityLog');
const { recordChange } = require('../services/auditTrail');
const projectMediaCtrl = require('./projectMediaController');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// ── Identity documents ────────────────────────────────────────────────────────
// The four Profile columns already registered in the DOC branch of
// `classifyStoredUrl` (services/fileAccess.js). A kind that is not in this map
// has no column pointing at it, which would make the file unreachable to
// everyone — a 404 even for an admin — so the allowlist is the feature.
const DOCUMENT_COLUMNS = {
  passport:     'passportUrl',
  residentId:   'residentIdUrl',
  tradeLicense: 'tradeLicenseUrl',
  cv:           'cvUrl',
};

const DOCUMENT_LABELS = {
  passport:     'Passport',
  residentId:   'Resident ID',
  tradeLicense: 'Trade licence',
  cv:           'CV',
};

/** Delete a stored upload, refusing to step outside uploads/. */
function unlinkStored(url) {
  if (!url) return;
  const rel = path.relative('/uploads', url).replace(/^\/+/, '');
  const abs = path.resolve(UPLOADS_ROOT, rel);
  // A stored path is data. It is never trusted to stay inside the directory.
  if (abs.startsWith(UPLOADS_ROOT + path.sep)) fs.unlink(abs, () => {});
}

const uploadDocument = async (req, res) => {
  try {
    const { id, kind } = req.params;
    const column = DOCUMENT_COLUMNS[kind];

    if (!column) {
      return res.status(400).json({
        error: `kind must be one of ${Object.keys(DOCUMENT_COLUMNS).join(', ')}`,
      });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const user = await prisma.user.findUnique({
      where:   { id },
      select:  { id: true, name: true, deletedAt: true, profile: true },
    });
    if (!user || user.deletedAt) {
      unlinkStored(`/uploads/${req.file.filename}`);
      return res.status(404).json({ error: 'Member not found' });
    }

    const previous = user.profile?.[column] || null;
    const stored   = `/uploads/${req.file.filename}`;

    await prisma.profile.upsert({
      where:  { userId: id },
      update: { [column]: stored },
      create: { userId: id, [column]: stored },
    });

    await recordChange({
      actor: req.user, action: 'SA_UPLOAD_DOCUMENT', targetId: id,
      before: { [column]: previous }, after: { [column]: stored },
      extra: { kind, originalName: req.file.originalname, bytes: req.file.size },
    });

    logActivity({
      type:        'DOCUMENT_UPLOADED',
      title:       `${DOCUMENT_LABELS[kind]} uploaded for ${user.name}`,
      description: previous ? 'Replaced the existing file' : 'New file',
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { kind },
    });

    // Only once the new path is committed, or a failure would lose both.
    if (previous && previous !== stored) unlinkStored(previous);

    res.json({ kind, url: stored, replaced: Boolean(previous) });
  } catch (err) {
    console.error('uploadDocument:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id, kind } = req.params;
    const column = DOCUMENT_COLUMNS[kind];
    if (!column) {
      return res.status(400).json({
        error: `kind must be one of ${Object.keys(DOCUMENT_COLUMNS).join(', ')}`,
      });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: id } });
    const existing = profile?.[column];
    if (!existing) return res.status(404).json({ error: 'No such document on this member' });

    await prisma.profile.update({ where: { userId: id }, data: { [column]: null } });

    await recordChange({
      actor: req.user, action: 'SA_DELETE_DOCUMENT', targetId: id,
      before: { [column]: existing }, after: { [column]: null }, extra: { kind },
    });
    logActivity({
      type:       'DOCUMENT_DELETED',
      title:      `${DOCUMENT_LABELS[kind]} deleted`,
      actorId:    req.user.id,
      actorName:  req.user.name,
      targetId:   id,
      metadata:   { kind },
    });

    unlinkStored(existing);
    res.json({ kind, deleted: true });
  } catch (err) {
    console.error('deleteDocument:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── KYC documents ─────────────────────────────────────────────────────────────

const KYC_TYPES    = ['id_proof', 'business_proof'];
const KYC_STATUSES = ['pending', 'approved', 'rejected'];

const addKycDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const documentType = req.body.documentType;

    if (!KYC_TYPES.includes(documentType)) {
      return res.status(400).json({ error: `documentType must be one of ${KYC_TYPES.join(', ')}` });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const user = await prisma.user.findUnique({
      where: { id }, select: { id: true, name: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      unlinkStored(`/uploads/kyc/${req.file.filename}`);
      return res.status(404).json({ error: 'Member not found' });
    }

    const doc = await prisma.kycDocument.create({
      data: {
        userId: id,
        documentType,
        documentUrl: `/uploads/kyc/${req.file.filename}`,
        status: KYC_STATUSES.includes(req.body.status) ? req.body.status : 'pending',
      },
    });

    await recordChange({
      actor: req.user, action: 'SA_ADD_KYC_DOCUMENT', targetId: id,
      extra: { documentId: doc.id, documentType, status: doc.status },
    });
    logActivity({
      type:        'DOCUMENT_UPLOADED',
      title:       `KYC document added for ${user.name}`,
      description: documentType,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      targetName:  user.name,
      metadata:    { documentType, status: doc.status },
    });

    res.json({ document: doc });
  } catch (err) {
    console.error('addKycDocument:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const reviewKycDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { status } = req.body;

    if (!KYC_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${KYC_STATUSES.join(', ')}` });
    }

    const doc = await prisma.kycDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.userId !== id) {
      return res.status(404).json({ error: 'Document not found on this member' });
    }

    const updated = await prisma.kycDocument.update({
      where: { id: docId }, data: { status },
    });

    await recordChange({
      actor: req.user, action: 'SA_REVIEW_KYC_DOCUMENT', targetId: id,
      before: { status: doc.status }, after: { status },
      extra: { documentId: docId, documentType: doc.documentType },
    });
    logActivity({
      type:        'KYC_DOCUMENT_REVIEWED',
      title:       `KYC document ${status}`,
      description: doc.documentType,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      metadata:    { documentId: docId, from: doc.status, to: status },
    });

    res.json({ document: updated });
  } catch (err) {
    console.error('reviewKycDocument:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteKycDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const doc = await prisma.kycDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.userId !== id) {
      return res.status(404).json({ error: 'Document not found on this member' });
    }

    await prisma.kycDocument.delete({ where: { id: docId } });

    await recordChange({
      actor: req.user, action: 'SA_DELETE_KYC_DOCUMENT', targetId: id,
      extra: { documentId: docId, documentType: doc.documentType },
    });
    logActivity({
      type:        'DOCUMENT_DELETED',
      title:       'KYC document deleted',
      description: doc.documentType,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    id,
      metadata:    { documentId: docId },
    });

    unlinkStored(doc.documentUrl);
    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteKycDocument:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Project deletion ──────────────────────────────────────────────────────────
//
// Nine tables carry a `projectId`, and the delete rule differs by table
// (verified against the live foreign keys, not inferred from the schema —
// Prisma defaults an OPTIONAL relation to SetNull and a REQUIRED one to
// Restrict, which is easy to read the wrong way round):
//
//   SET NULL — transactions, wallet_investments, profit_configs,
//     profit_records, enquiries. The row survives with its project
//     attribution cleared, so the ledger keeps every figure. The database
//     does this on its own; the explicit updateMany below makes the intent
//     visible and keeps it true if a relation is ever made required.
//
//   CASCADE — milestones, project_documents. Deleted with the project, which
//     is why the document paths are collected first: otherwise the files are
//     stranded on disk with nothing pointing at them.
//
//   RESTRICT — investments, investment_requests. These are the only two that
//     actually block a delete, and `projectId` is NOT NULL on both, so the
//     rows can only be deleted, never detached. Requests are workflow records
//     and may be discarded on confirmation. A settled Investment is booked
//     capital: it is never destroyed here. Return the capital first.

async function projectBlockers(projectId) {
  const [transactions, walletInvestments, profitConfigs, profitRecords,
         investments, investmentRequests, documents, milestones] = await Promise.all([
    prisma.transaction.count({ where: { projectId } }),
    prisma.walletInvestment.count({ where: { projectId } }),
    prisma.profitConfig.count({ where: { projectId } }),
    prisma.profitRecord.count({ where: { projectId } }),
    prisma.investment.count({ where: { projectId } }),
    prisma.investmentRequest.count({ where: { projectId } }),
    prisma.projectDocument.count({ where: { projectId } }),
    prisma.milestone.count({ where: { projectId } }),
  ]);

  return {
    detachable: { transactions, walletInvestments, profitConfigs, profitRecords },
    blocking:   { investments, investmentRequests },
    cascading:  { documents, milestones },
  };
}

// What a forced delete would do, so the UI can say it before anything happens.
const getProjectDeleteManifest = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where:  { id: req.params.id },
      select: { id: true, title: true, status: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const counts = await projectBlockers(project.id);
    const detachTotal = Object.values(counts.detachable).reduce((a, b) => a + b, 0);

    res.json({
      project,
      counts,
      canDelete: counts.blocking.investments === 0,
      // Mirrors exactly what forceDeleteProject will do, in order.
      willHappen: [
        counts.cascading.documents
          ? `${counts.cascading.documents} media file(s) deleted from disk`  : null,
        counts.cascading.milestones
          ? `${counts.cascading.milestones} milestone(s) deleted`            : null,
        detachTotal
          ? `${detachTotal} ledger row(s) kept, project attribution cleared` : null,
        counts.blocking.investmentRequests
          ? `${counts.blocking.investmentRequests} investment request(s) deleted — needs cascadeRequests` : null,
        counts.blocking.investments
          ? `BLOCKED: ${counts.blocking.investments} settled investment(s). Return the capital first.` : null,
      ].filter(Boolean),
    });
  } catch (err) {
    console.error('getProjectDeleteManifest:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const forceDeleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (String(req.body.confirm || '').trim() !== project.title) {
      return res.status(400).json({
        error: "Type the project's exact title in `confirm` to force-delete it.",
        expected: project.title,
      });
    }

    const counts = await projectBlockers(id);

    if (counts.blocking.investments > 0) {
      return res.status(409).json({
        error: `This project has ${counts.blocking.investments} settled investment(s). `
             + 'Booked capital is never destroyed here — return the capital first, '
             + 'then delete the project.',
        counts,
      });
    }
    if (counts.blocking.investmentRequests > 0 && req.body.cascadeRequests !== true) {
      return res.status(409).json({
        error: `This project has ${counts.blocking.investmentRequests} investment request(s). `
             + 'Pass cascadeRequests: true to delete them along with the project.',
        counts,
      });
    }

    // Paths first: project_documents cascades in the database, which would
    // strand the files on disk with nothing pointing at them.
    const documents = await prisma.projectDocument.findMany({
      where: { projectId: id }, select: { fileUrl: true },
    });

    await recordChange({
      actor: req.user, action: 'SA_FORCE_DELETE_PROJECT',
      extra: { projectId: id, title: project.title, counts },
    });

    await prisma.$transaction(async (tx) => {
      // Detach what can survive, so no ledger figure is lost.
      await tx.transaction.updateMany({ where: { projectId: id }, data: { projectId: null } });
      await tx.walletInvestment.updateMany({ where: { projectId: id }, data: { projectId: null } });
      await tx.profitConfig.updateMany({ where: { projectId: id }, data: { projectId: null } });
      await tx.profitRecord.updateMany({ where: { projectId: id }, data: { projectId: null } });
      if (counts.blocking.investmentRequests > 0) {
        await tx.investmentRequest.deleteMany({ where: { projectId: id } });
      }
      await tx.project.delete({ where: { id } });
    });

    documents.forEach((d) => {
      fs.unlink(path.join(projectMediaCtrl.MEDIA_DIR, path.basename(d.fileUrl)), () => {});
    });

    logActivity({
      type:        'PROJECT_DELETED',
      title:       `Project deleted: ${project.title}`,
      description: `${documents.length} media file(s) removed`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { projectId: id, counts },
    });

    res.json({ message: 'Project deleted', detached: counts.detachable, filesRemoved: documents.length });
  } catch (err) {
    console.error('forceDeleteProject:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Ownership transfer ────────────────────────────────────────────────────────

const transferProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { ownerId, managerId } = req.body;

    if (!ownerId && !managerId) {
      return res.status(400).json({ error: 'Pass ownerId, managerId, or both' });
    }

    const project = await prisma.project.findUnique({
      where:  { id },
      select: { id: true, title: true, ownerId: true, managerId: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const data = {};
    for (const [field, value] of [['ownerId', ownerId], ['managerId', managerId]]) {
      if (!value) continue;
      const user = await prisma.user.findUnique({
        where: { id: value }, select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) {
        return res.status(400).json({ error: `No live member with id ${value} for ${field}` });
      }
      data[field] = value;
    }

    const updated = await prisma.project.update({
      where: { id }, data,
      select: { id: true, title: true, ownerId: true, managerId: true },
    });

    await recordChange({
      actor: req.user, action: 'SA_TRANSFER_PROJECT',
      before: { ownerId: project.ownerId, managerId: project.managerId },
      after:  { ownerId: updated.ownerId, managerId: updated.managerId },
      extra:  { projectId: id, title: project.title },
    });
    logActivity({
      type:        'PROJECT_TRANSFERRED',
      title:       `Project ownership transferred: ${project.title}`,
      description: Object.keys(data).join(', '),
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { projectId: id, ...data },
    });

    res.json({ project: updated });
  } catch (err) {
    console.error('transferProject:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const transferCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { createdById } = req.body;
    if (!createdById) return res.status(400).json({ error: 'createdById is required' });

    const company = await prisma.company.findUnique({
      where: { id }, select: { id: true, name: true, createdById: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const user = await prisma.user.findUnique({
      where: { id: createdById }, select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      return res.status(400).json({ error: `No live member with id ${createdById}` });
    }

    const updated = await prisma.company.update({
      where: { id }, data: { createdById },
      select: { id: true, name: true, createdById: true },
    });

    await recordChange({
      actor: req.user, action: 'SA_TRANSFER_COMPANY',
      before: { createdById: company.createdById },
      after:  { createdById: updated.createdById },
      extra:  { companyId: id, name: company.name },
    });
    logActivity({
      type:       'COMPANY_TRANSFERRED',
      title:      `Company ownership transferred: ${company.name}`,
      actorId:    req.user.id,
      actorName:  req.user.name,
      metadata:   { companyId: id, createdById },
    });

    res.json({ company: updated });
  } catch (err) {
    console.error('transferCompany:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Content removal ───────────────────────────────────────────────────────────
// A post or comment belongs to the member who wrote it. An admin can already
// remove one through the community routes; what this adds is removal
// regardless of author, with an audit row naming who did it.

const deletePost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true, content: true, type: true },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await prisma.post.delete({ where: { id: post.id } });

    await recordChange({
      actor: req.user, action: 'SA_DELETE_POST', targetId: post.authorId,
      extra: { postId: post.id, type: post.type, excerpt: (post.content || '').slice(0, 200) },
    });
    logActivity({
      type:        'POST_DELETED',
      title:       'Post deleted by super admin',
      description: (post.content || '').slice(0, 140),
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    post.authorId,
      metadata:    { postId: post.id },
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error('deletePost:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteComment = async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true, content: true },
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    await prisma.comment.delete({ where: { id: comment.id } });

    await recordChange({
      actor: req.user, action: 'SA_DELETE_COMMENT', targetId: comment.authorId,
      extra: { commentId: comment.id, excerpt: (comment.content || '').slice(0, 200) },
    });
    logActivity({
      type:        'COMMENT_DELETED',
      title:       'Comment deleted by super admin',
      description: (comment.content || '').slice(0, 140),
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    comment.authorId,
      metadata:    { commentId: comment.id },
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteComment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    await prisma.enquiry.delete({ where: { id: enquiry.id } });

    await recordChange({
      actor: req.user, action: 'SA_DELETE_ENQUIRY', targetId: enquiry.memberId || null,
      extra: { enquiryId: enquiry.id, status: enquiry.status },
    });
    logActivity({
      type:       'ENQUIRY_DELETED',
      title:      'Enquiry deleted',
      actorId:    req.user.id,
      actorName:  req.user.name,
      metadata:   { enquiryId: enquiry.id },
    });

    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteEnquiry:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Ledger reversal ───────────────────────────────────────────────────────────
//
// The undo for a manual transaction, and the reason no endpoint anywhere edits
// a balance directly. It books the mirror-image entry and lets syncWallet
// recompute, so the original row stays in the member's statement and the
// correction is visible beside it.
//
// Only the three manual categories can be reversed. INVESTMENT, PROFIT,
// CAPITAL_RETURN and PROFIT_ADJUSTMENT come from the investment engine, where
// the figure is derived from a WalletInvestment or ProfitRecord: reversing the
// transaction alone would leave the ledger disagreeing with its own source.
const REVERSIBLE = ['ADMIN_CREDIT', 'ADMIN_DEBIT', 'WITHDRAWAL'];

const reverseTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const original = await prisma.transaction.findUnique({
      where:  { id },
      include: { user: { select: { id: true, name: true, deletedAt: true } } },
    });
    if (!original) return res.status(404).json({ error: 'Transaction not found' });

    if (!REVERSIBLE.includes(original.category)) {
      return res.status(400).json({
        error: `${original.category} transactions come from the investment engine and `
             + 'cannot be reversed here. Use return capital or a profit adjustment so the '
             + 'ledger stays consistent with its source records.',
        reversible: REVERSIBLE,
      });
    }

    // The reversal itself is a transaction, so a second one would double-count.
    const already = await prisma.transaction.findFirst({
      where: { description: { contains: `[reversal of ${original.reference}]` } },
      select: { id: true },
    });
    if (already) {
      return res.status(409).json({
        error: 'This transaction has already been reversed.',
        reversalId: already.id,
      });
    }

    const wasDebit = original.type === 'DEBIT';
    const amount   = walletService.money(original.amount);

    const reversal = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: original.userId } });
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

      // The exact inverse of what adminController.addTransaction did: a debit
      // raised withdrawnProfit, a credit raised profitAmount.
      if (wasDebit) {
        await tx.wallet.update({
          where: { userId: original.userId },
          data:  { withdrawnProfit: { decrement: amount } },
        });
      } else {
        const breakdown = await walletService.getWalletBreakdown(original.userId, tx);
        if (amount > breakdown.availableProfit) {
          throw Object.assign(
            new Error(`Reversing this credit would overdraw the wallet. `
                    + `Available profit is ${breakdown.availableProfit}.`),
            { status: 400 },
          );
        }
        await tx.wallet.update({
          where: { userId: original.userId },
          data:  { profitAmount: { decrement: amount } },
        });
      }

      const breakdown = await walletService.syncWallet(original.userId, tx);

      return tx.transaction.create({
        data: {
          userId:       original.userId,
          type:         wasDebit ? 'CREDIT' : 'DEBIT',
          category:     wasDebit ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
          amount,
          balanceAfter: breakdown.totalBalance,
          description:  `Reversal: ${original.description} [reversal of ${original.reference}]`,
          createdBy:    req.user.id,
        },
      });
    });

    await recordChange({
      actor: req.user, action: 'SA_REVERSE_TRANSACTION', targetId: original.userId,
      extra: {
        originalId: original.id, originalReference: original.reference,
        originalCategory: original.category, amount, reversalId: reversal.id,
      },
    });
    logActivity({
      type:        'TRANSACTION_REVERSED',
      title:       `Transaction reversed: ${original.user?.name || ''}`.trim(),
      description: `${original.category} ${amount} — ${original.description}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      targetId:    original.userId,
      targetName:  original.user?.name,
      amount,
      metadata:    { originalId: original.id, reversalId: reversal.id },
    });

    res.json({ reversal, original: { id: original.id, reference: original.reference } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('reverseTransaction:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  DOCUMENT_COLUMNS,
  uploadDocument, deleteDocument,
  addKycDocument, reviewKycDocument, deleteKycDocument,
  getProjectDeleteManifest, forceDeleteProject,
  transferProject, transferCompany,
  deletePost, deleteComment, deleteEnquiry,
  reverseTransaction,
};
