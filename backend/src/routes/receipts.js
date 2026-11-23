// src/routes/receipts.js
//
// A receipt PDF is readable by the member it was issued to and by a super
// admin, and by nobody else - an ordinary admin included. Anyone else gets a
// 404 rather than a 403, so the id does not confirm that a receipt exists.
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prismaClient');
const receipts = require('../services/receipts');
const zoho = require('../services/zohoBooks');
const { authenticate, requireActive } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/roles');

router.use(authenticate, requireActive);

router.get('/:id/pdf', async (req, res) => {
  try {
    const r = await prisma.receipt.findUnique({ where: { id: req.params.id } });
    if (!r || (r.userId !== req.user.id && !isSuperAdmin(req.user.role))) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    // A super admin may open a draft to check it before it is sent; a member only an issued one.
    const viewable = r.status === 'ISSUED' || (r.status === 'DRAFT' && isSuperAdmin(req.user.role));
    if (!viewable || !r.zohoReceiptId) {
      return res.status(409).json({ error: 'This invoice is still being prepared' });
    }
    const pdf = await zoho.getInvoicePdf(r.zohoReceiptId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(r.receiptNumber || 'invoice').replace(/[^\w.-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  } catch (err) {
    console.error('receipt pdf error:', err.message);
    res.status(502).json({ error: 'Could not load the invoice right now' });
  }
});

router.post('/:id/retry', async (req, res) => {
  if (!isSuperAdmin(req.user.role)) return res.status(404).json({ error: 'Invoice not found' });
  const n = await receipts.retry(req.params.id);
  if (!n) return res.status(409).json({ error: 'Only a pending or failed receipt can be retried' });
  res.json({ ok: true });
});

module.exports = router;
