// src/routes/events.js
const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin, requireActive } = require('../middleware/auth');
const ctrl = require('../controllers/eventsController');

router.use(authenticate, requireActive);

router.get('/',              ctrl.getEvents);
router.get('/:id',           ctrl.getEvent);
router.post('/',             requireAdmin, ctrl.createEvent);
router.put('/:id',           requireAdmin, ctrl.updateEvent);
// Destroys every registration attached to the event.
router.delete('/:id',        requireSuperAdmin, ctrl.deleteEvent);
router.post('/:id/register', ctrl.registerForEvent);
router.delete('/:id/register', ctrl.cancelRegistration);

module.exports = router;
