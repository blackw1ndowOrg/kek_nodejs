const { z } = require('zod');

const positiveId = z.coerce
  .number({ invalid_type_error: 'Group ID must be a number' })
  .int('Group ID must be an integer')
  .positive('Group ID must be positive');

const groupProfitSchema = z.object({
  params: z.object({
    id: positiveId,
  }),
});

module.exports = {
  groupProfitSchema,
  positiveId,
};

