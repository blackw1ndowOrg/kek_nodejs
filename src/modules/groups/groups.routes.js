const { Router } = require('express');
const { Role } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  groupIdSchema,
  listGroupsSchema,
  createGroupSchema,
  updateGroupSchema,
  enrollChildSchema,
  groupChildSchema,
} = require('./groups.schema');
const { groupsController } = require('./groups.controller');

// Керують групами адмін і менеджер; вихователь лише переглядає свої групи (обмеження — у сервісі).
// Батьки бачать групу дитини через модуль children.
const STAFF = [Role.ADMIN, Role.MANAGER];
const STAFF_AND_TEACHER = [...STAFF, Role.TEACHER];

const router = Router();

router.use(auth);

router.get('/', authorize(...STAFF_AND_TEACHER), validate(listGroupsSchema), groupsController.list);
router.get(
  '/:id',
  authorize(...STAFF_AND_TEACHER),
  validate(groupIdSchema),
  groupsController.getById
);
router.post('/', authorize(...STAFF), validate(createGroupSchema), groupsController.create);
router.patch('/:id', authorize(...STAFF), validate(updateGroupSchema), groupsController.update);
router.delete('/:id', authorize(...STAFF), validate(groupIdSchema), groupsController.delete);
router.post(
  '/:id/children',
  authorize(...STAFF),
  validate(enrollChildSchema),
  groupsController.enrollChild
);
router.delete(
  '/:id/children/:childId',
  authorize(...STAFF),
  validate(groupChildSchema),
  groupsController.unenrollChild
);

module.exports = router;
