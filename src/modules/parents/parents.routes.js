const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  createParentSchema,
  updateParentSchema,
  parentIdParamSchema,
  parentsQuerySchema,
} = require('./parents.schema');
const { parentsController } = require('./parents.controller');

const router = Router();

router.use(auth, authorize('ADMIN', 'MANAGER'));

router.post('/', validate(createParentSchema), parentsController.create);
router.get('/', validate(parentsQuerySchema), parentsController.getAll);
router.get('/:id', validate(parentIdParamSchema), parentsController.getById);
router.patch(
  '/:id',
  validate(parentIdParamSchema),
  validate(updateParentSchema),
  parentsController.update
);
router.delete('/:id', validate(parentIdParamSchema), parentsController.delete);

module.exports = router;
