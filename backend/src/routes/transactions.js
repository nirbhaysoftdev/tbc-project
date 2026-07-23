// src/routes/transactions.js
const express = require('express');
const router  = express.Router();
const { authenticate, requireActive } = require('../middleware/auth');
const txController     = require('../controllers/transactionController');

router.use(authenticate, requireActive);

router.get('/',        txController.getTransactions);
router.get('/export',  txController.exportPDF);
router.get('/csv',     txController.exportCSV);

module.exports = router;
