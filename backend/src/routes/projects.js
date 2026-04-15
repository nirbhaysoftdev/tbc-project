// src/routes/projects.js
const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/projectsController');

router.use(authenticate);

router.get('/my-investments',              ctrl.getMyInvestments);
router.get('/',                            ctrl.getProjects);
router.get('/:id',                         ctrl.getProject);
router.post('/',        requireAdmin,      ctrl.createProject);
router.put('/:id',      requireAdmin,      ctrl.updateProject);
router.delete('/:id',   requireAdmin,      ctrl.deleteProject);
router.post('/:id/invest',                 ctrl.invest);
router.post('/:id/milestones', requireAdmin, ctrl.addMilestone);

module.exports = router;
