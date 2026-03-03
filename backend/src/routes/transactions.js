// src/routes/transactions.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const txController     = require('../controllers/transactionController');

router.get('/',        authenticate, txController.getTransactions);
router.get('/export',  authenticate, txController.exportPDF);
router.get('/csv',     authenticate, txController.exportCSV);

module.exports = router;
