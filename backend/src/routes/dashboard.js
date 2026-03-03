// src/routes/dashboard.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const dashController   = require('../controllers/dashboardController');

router.get('/summary',  authenticate, dashController.getSummary);
router.get('/chart',    authenticate, dashController.getChartData);

module.exports = router;
