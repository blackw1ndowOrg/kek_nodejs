const { Router } = require('express');
const { Role } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { groupProfitSchema } = require('./analytics.schema');
const { analyticsController } = require('./analytics.controller');

const router = Router();

// Лише адміністратор та менеджер мають доступ до фінансової аналітики садка
const STAFF = [Role.ADMIN, Role.MANAGER];

router.use(auth);

router.get(
  '/groups/:id/profit',
  authorize(...STAFF),
  validate(groupProfitSchema),
  analyticsController.getGroupProfit
);

router.get(
  '/profit',
  authorize(...STAFF),
  analyticsController.getTotalProfit
);

module.exports = router;

