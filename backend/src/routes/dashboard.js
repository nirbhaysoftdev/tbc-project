// src/routes/dashboard.js
const express = require('express');
const router  = express.Router();
const { authenticate, requireActive } = require('../middleware/auth');
const dashController   = require('../controllers/dashboardController');

router.use(authenticate, requireActive);

router.get('/summary',  dashController.getSummary);
router.get('/chart',    dashController.getChartData);

module.exports = router;
