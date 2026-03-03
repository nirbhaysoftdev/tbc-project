// src/controllers/transactionController.js

const PDFDocument = require('pdfkit');

// ── Get transactions with filters ────────────
const getTransactions = async (req, res) => {
  try {
    const {
      type,
      status,
      from,
      to,
      minAmount,
      maxAmount,
      page  = 1,
      limit = 20,
    } = req.query;

    const where = { userId: req.user.id };

    if (type)      where.type   = type;
    if (status)    where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) where.amount.gte = parseFloat(minAmount);
      if (maxAmount) where.amount.lte = parseFloat(maxAmount);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      transactions,
      pagination: {
        page:       parseInt(page),
        limit:      parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Export PDF statement ──────────────────────
const exportPDF = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:   { id: req.user.id },
      include: { wallet: true },
    });

    const transactions = await prisma.transaction.findMany({
      where:   { userId: req.user.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="TBC-Statement-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).fillColor('#1a2550').text('TRILLION BUSINESS COMMUNITY', { align: 'center' });
    doc.fontSize(12).fillColor('#666').text('Member Account Statement', { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#c8a84b');
    doc.moveDown();

    // Member info
    doc.fontSize(11).fillColor('#333');
    doc.text(`Member: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`);
    doc.moveDown();

    // Summary
    doc.fontSize(13).fillColor('#1a2550').text('Account Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Investment Amount:  € ${(user.wallet?.investmentAmount || 0).toLocaleString()}`);
    doc.text(`Profit:            € ${(user.wallet?.profitAmount || 0).toLocaleString()}`);
    doc.text(`Total Balance:     € ${(user.wallet?.totalBalance || 0).toLocaleString()}`);
    doc.moveDown();

    // Transactions
    doc.fontSize(13).fillColor('#1a2550').text('Transaction History', { underline: true });
    doc.moveDown(0.5);

    // Table header
    const cols = [50, 120, 200, 340, 430, 500];
    doc.fontSize(9).fillColor('#666');
    doc.text('Date',      cols[0], doc.y, { width: 70 });
    doc.text('Type',      cols[1], doc.y - doc.currentLineHeight(), { width: 80 });
    doc.text('Description', cols[2], doc.y - doc.currentLineHeight(), { width: 140 });
    doc.text('Amount',    cols[3], doc.y - doc.currentLineHeight(), { width: 90 });
    doc.text('Status',    cols[4], doc.y - doc.currentLineHeight(), { width: 70 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ddd');
    doc.moveDown(0.3);

    transactions.forEach(tx => {
      const y = doc.y;
      doc.fontSize(9).fillColor('#333');
      doc.text(new Date(tx.createdAt).toLocaleDateString('en-GB'), cols[0], y, { width: 70 });
      doc.text(tx.type,        cols[1], y, { width: 80 });
      doc.text(tx.description, cols[2], y, { width: 140 });
      const sign = tx.type === 'CREDIT' ? '+' : '-';
      doc.fillColor(tx.type === 'CREDIT' ? '#1a7a4a' : '#c0392b');
      doc.text(`${sign}€ ${tx.amount.toLocaleString()}`, cols[3], y, { width: 90 });
      doc.fillColor('#666');
      doc.text(tx.status, cols[4], y, { width: 70 });
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Export CSV ────────────────────────────────
const exportCSV = async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Date,Type,Description,Amount,Status,Reference\n';
    const rows   = transactions.map(tx =>
      `${new Date(tx.createdAt).toISOString()},${tx.type},"${tx.description}",${tx.amount},${tx.status},${tx.reference}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="TBC-Transactions-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getTransactions, exportPDF, exportCSV };
