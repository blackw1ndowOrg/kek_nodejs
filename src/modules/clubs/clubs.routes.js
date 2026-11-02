const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { clubIdSchema, createClubSchema, updateClubSchema } = require('./clubs.schema');
const { clubsController } = require('./clubs.controller');

const router = Router();

router.use(auth);

router.get('/', authorize('ADMIN', 'MANAGER', 'TEACHER'), clubsController.list);
router.get(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'TEACHER'),
  validate(clubIdSchema),
  clubsController.getById
);

router.post('/', authorize('ADMIN'), validate(createClubSchema), clubsController.create);
router.patch('/:id', authorize('ADMIN'), validate(updateClubSchema), clubsController.update);
router.delete('/:id', authorize('ADMIN'), validate(clubIdSchema), clubsController.remove);

module.exports = router;
