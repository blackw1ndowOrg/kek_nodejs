const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { getChildBillingSchema, payChildSchema } = require('./billing.schema');
const { billingController } = require('./billing.controller');

const router = Router();

router.use(auth, authorize('PARENT', 'ADMIN', 'MANAGER'));

router.get(
  '/children/:childId',
  validate(getChildBillingSchema),
  billingController.getChildBilling
);
router.post('/children/:childId/payments', validate(payChildSchema), billingController.pay);

module.exports = router;
