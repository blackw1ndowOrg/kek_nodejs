const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  createStaffSchema,
  updateStaffSchema,
  staffIdParamSchema,
  staffQuerySchema,
} = require('./staff.schema');
const { staffController } = require('./staff.controller');

const router = Router();

router.use(auth);

router.get(
  '/',
  authorize('ADMIN', 'MANAGER', 'TEACHER'),
  validate(staffQuerySchema),
  staffController.getAll
);
router.get(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'TEACHER'),
  validate(staffIdParamSchema),
  staffController.getById
);

router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  validate(createStaffSchema),
  staffController.create
);
router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(staffIdParamSchema),
  validate(updateStaffSchema),
  staffController.update
);
router.delete(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(staffIdParamSchema),
  staffController.delete
);

module.exports = router;
