const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  listRoomsSchema,
  roomIdSchema,
  createRoomSchema,
  updateRoomSchema,
} = require('./rooms.schema');
const { roomsController } = require('./rooms.controller');

const router = Router();

router.use(auth);

router.get(
  '/',
  authorize('ADMIN', 'MANAGER', 'TEACHER'),
  validate(listRoomsSchema),
  roomsController.list
);
router.get(
  '/:id',
  authorize('ADMIN', 'MANAGER', 'TEACHER'),
  validate(roomIdSchema),
  roomsController.getById
);

router.post('/', authorize('ADMIN'), validate(createRoomSchema), roomsController.create);
router.patch('/:id', authorize('ADMIN'), validate(updateRoomSchema), roomsController.update);
router.delete('/:id', authorize('ADMIN'), validate(roomIdSchema), roomsController.remove);

module.exports = router;
