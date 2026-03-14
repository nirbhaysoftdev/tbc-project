// src/routes/withdraw.js
const express  = require('express');
const router   = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl     = require('../controllers/withdrawController');

router.post('/',              authenticate,               ctrl.createRequest);
router.get('/my',             authenticate,               ctrl.getMyRequests);
router.get('/admin/all',      authenticate, requireAdmin, ctrl.getAllRequests);
router.put('/admin/:id/approve', authenticate, requireAdmin, ctrl.approveRequest);
router.put('/admin/:id/reject',  authenticate, requireAdmin, ctrl.rejectRequest);

module.exports = router;