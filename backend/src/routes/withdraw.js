// src/routes/withdraw.js
const express  = require('express');
const router   = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin, requireActive } = require('../middleware/auth');
const ctrl     = require('../controllers/withdrawController');

router.post('/',              authenticate, requireActive, ctrl.createRequest);
router.get('/my',             authenticate, requireActive, ctrl.getMyRequests);
router.get('/admin/all',      authenticate, requireAdmin,  ctrl.getAllRequests);
// Both decisions are final and move money out of the platform.
router.put('/admin/:id/approve', authenticate, requireSuperAdmin, ctrl.approveRequest);
router.put('/admin/:id/reject',  authenticate, requireSuperAdmin, ctrl.rejectRequest);

module.exports = router;