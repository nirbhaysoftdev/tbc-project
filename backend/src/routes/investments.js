// src/routes/investments.js
// Admin-only capital / profit engine endpoints.
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const investmentController = require('../controllers/investmentController');
const investmentRequestController = require('../controllers/investmentRequestController');

router.use(authenticate, requireAdmin);

// Deal-room projects, annotated with the capital booked against each
router.get('/investment-projects', investmentController.listProjects);

// Investment requests: members ask, admin confirms payment and completes
router.get('/investment-requests', investmentRequestController.listRequests);
router.get('/investment-requests/:id', investmentRequestController.getRequest);
router.put('/investment-requests/:id/payment-received', investmentRequestController.markPaymentReceived);
// Rejection is terminal, and every other rejection in the portal is
// super-admin only. Creating and completing requests stays with ADMIN.
router.put('/investment-requests/:id/reject', requireSuperAdmin, investmentRequestController.rejectRequest);
router.post('/investment-requests/:id/complete', investmentRequestController.completeRequest);

// Investments (capital)
router.get('/investments', investmentController.listInvestments);
router.post('/investments', investmentController.createInvestment);
// Unwinds a booked position and pays capital back out.
router.post('/investments/:id/return-capital', requireSuperAdmin, investmentController.returnCapital);

// Profit
router.post('/profit/one-time', investmentController.createOneTimeProfit);
router.put('/profit/monthly-config', investmentController.setMonthlyProfitConfig);
router.get('/profit/monthly-preview', investmentController.previewMonthlyProfit);
router.get('/profit/records', investmentController.listProfitRecords);
router.post('/profit/generate-monthly', investmentController.runMonthlyGeneration);

module.exports = router;
