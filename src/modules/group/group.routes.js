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
} = require('./group.schema');
const { groupController } = require('./group.controller');

// Керують групами адмін і менеджер; вихователь лише переглядає свої групи (обмеження — у сервісі).
// Батьки бачать групу дитини через модуль children.
const STAFF = [Role.ADMIN, Role.MANAGER];
const STAFF_AND_TEACHER = [...STAFF, Role.TEACHER];

const router = Router();

router.use(auth);

router.get('/', authorize(...STAFF_AND_TEACHER), validate(listGroupsSchema), groupController.list);
router.get(
  '/:id',
  authorize(...STAFF_AND_TEACHER),
  validate(groupIdSchema),
  groupController.getById
);
router.post('/', authorize(...STAFF), validate(createGroupSchema), groupController.create);
router.patch('/:id', authorize(...STAFF), validate(updateGroupSchema), groupController.update);
router.delete('/:id', authorize(...STAFF), validate(groupIdSchema), groupController.delete);
router.post(
  '/:id/children',
  authorize(...STAFF),
  validate(enrollChildSchema),
  groupController.enrollChild
);
router.delete(
  '/:id/children/:childId',
  authorize(...STAFF),
  validate(groupChildSchema),
  groupController.unenrollChild
);

module.exports = router;
