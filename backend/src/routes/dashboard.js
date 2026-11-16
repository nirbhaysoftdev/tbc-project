// src/routes/dashboard.js
const express = require('express');
const router  = express.Router();
const { authenticate, requireActive } = require('../middleware/auth');
const dashController   = require('../controllers/dashboardController');
const insuranceController = require('../controllers/insuranceController');

router.use(authenticate, requireActive);

router.get('/summary',  dashController.getSummary);
router.get('/chart',    dashController.getChartData);
router.get('/insurance', insuranceController.mine);
router.get('/returns',   dashController.getReturns);
router.get('/portfolio', dashController.getPortfolio);

module.exports = router;
