const { Router } = require('express');
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { keyParamsSchema, updateSettingSchema } = require('./settings.schema');
const { settingsController } = require('./settings.controller');

const router = Router();

// Prices, salaries, and thresholds can only be viewed and updated by Admin
router.use(auth, authorize('ADMIN'));

router.get('/', settingsController.list);
router.post('/reload', settingsController.reload);
router.get('/:key', validate(keyParamsSchema), settingsController.getOne);
router.put('/:key', validate(updateSettingSchema), settingsController.update);
router.patch('/:key', validate(updateSettingSchema), settingsController.update);

module.exports = router;