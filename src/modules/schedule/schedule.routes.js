const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { groupScheduleSchema, updateSlotSchema } = require('./schedule.schema');
const { scheduleController } = require('./schedule.controller');

const router = Router();

router.use(auth);

router.post('/generate', authorize('ADMIN'), scheduleController.generate);
router.get('/my', authorize('TEACHER'), scheduleController.getMine);
router.get(
  '/groups/:groupId',
  authorize('ADMIN', 'MANAGER', 'TEACHER', 'PARENT'),
  validate(groupScheduleSchema),
  scheduleController.getGroup
);
router.delete(
  '/groups/:groupId',
  authorize('ADMIN'),
  validate(groupScheduleSchema),
  scheduleController.clearGroup
);
router.patch(
  '/slots/:id',
  authorize('ADMIN'),
  validate(updateSlotSchema),
  scheduleController.updateSlot
);

module.exports = router;
