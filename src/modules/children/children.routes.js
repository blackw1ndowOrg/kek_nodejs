const { Router } = require('express');
const { Role } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  childIdSchema,
  listChildrenSchema,
  createChildSchema,
  updateChildSchema,
} = require('./children.schema');
const { childrenController } = require('./children.controller');

const STAFF = [Role.ADMIN, Role.MANAGER];
const STAFF_AND_PARENT = [...STAFF, Role.PARENT];

const router = Router();

router.use(auth);

router.get(
  '/',
  authorize(...STAFF_AND_PARENT),
  validate(listChildrenSchema),
  childrenController.list
);
router.get(
  '/:id',
  authorize(...STAFF_AND_PARENT),
  validate(childIdSchema),
  childrenController.getById
);
router.post('/', authorize(...STAFF), validate(createChildSchema), childrenController.create);
router.patch(
  '/:id',
  authorize(...STAFF_AND_PARENT),
  validate(updateChildSchema),
  childrenController.update
);
router.delete('/:id', authorize(...STAFF), validate(childIdSchema), childrenController.deactivate);

module.exports = router;
