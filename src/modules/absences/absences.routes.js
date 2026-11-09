const { Router } = require('express');
const { Role } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  createAbsenceSchema,
  listAbsencesSchema,
  deleteAbsenceSchema,
} = require('./absences.schema');
const { absencesController } = require('./absences.controller');

// Монтується на /api/v1/children/:childId/absences; mergeParams дає доступ до :childId
const router = Router({ mergeParams: true });

router.use(auth, authorize(Role.ADMIN, Role.MANAGER, Role.PARENT));

router.post('/', validate(createAbsenceSchema), absencesController.create);
router.get('/', validate(listAbsencesSchema), absencesController.list);
router.delete('/:absenceId', validate(deleteAbsenceSchema), absencesController.remove);

module.exports = router;
