const { z } = require('zod');

const positiveId = z.coerce
  .number({ invalid_type_error: 'Group ID must be a number' })
  .int('Group ID must be an integer')
  .positive('Group ID must be positive');

const attendanceRateSchema = z
  .preprocess(
    (val) => (typeof val === 'string' && val.trim() !== '' ? Number(val) : val),
    z
      .number({ invalid_type_error: 'attendanceRate must be a number' })
      .positive('attendanceRate must be positive')
      .max(1, 'attendanceRate cannot exceed 1')
  )
  .optional();

const groupProfitSchema = z.object({
  params: z.object({
    id: positiveId,
  }),
  query: z
    .object({
      attendanceRate: attendanceRateSchema,
    })
    .optional(),
});

const totalProfitSchema = z.object({
  query: z
    .object({
      attendanceRate: attendanceRateSchema,
    })
    .optional(),
});

const ageCount = z
  .preprocess(
    (val) => {
      if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
        return Number(val);
      }
      return val;
    },
    z
      .number({ invalid_type_error: 'Demand must be a number' })
      .int('Demand must be an integer')
      .min(0, 'Demand must be non-negative')
      .max(10000, 'Demand cannot exceed 10000')
  )
  .optional();

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
    2: ageCount,
    3: ageCount,
    4: ageCount,
    5: ageCount,
    age2: ageCount,
    age3: ageCount,
    age4: ageCount,
    age5: ageCount,
    demand: z.record(z.unknown()).optional(),
    ageGroups: z.record(z.unknown()).optional(),
    attendanceRate: attendanceRateSchema,
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
  totalProfitSchema,
  forecastSchema,
  positiveId,
  attendanceRateSchema,
};
