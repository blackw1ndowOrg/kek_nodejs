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

const forecastBodySchema = z
  .object({
    targetChildrenCount: z
      .preprocess(
        (val) => {
          if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
            return Number(val);
          }
          return val;
        },
        z
          .number({ invalid_type_error: 'Target children count must be a number' })
          .int('Target children count must be an integer')
          .min(0, 'Target children count must be non-negative')
          .max(300, 'Target children count cannot exceed maximum capacity of 300')
      )
      .optional(),
    demand: z.record(z.unknown()).optional(),
    ageGroups: z.record(z.unknown()).optional(),
    attendanceRate: z
      .preprocess(
        (val) => (typeof val === 'string' && val.trim() !== '' ? Number(val) : val),
        z.number().positive().max(1)
      )
      .optional(),
    threshold: z
      .preprocess(
        (val) => (typeof val === 'string' && val.trim() !== '' ? Number(val) : val),
        z.number().int().nonnegative()
      )
      .optional(),
  })
  .passthrough();

const forecastSchema = z.object({
  body: forecastBodySchema.optional().default({}),
});

module.exports = {
  groupProfitSchema,
  forecastSchema,
  positiveId,
};
