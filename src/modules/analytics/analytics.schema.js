const { z } = require('zod');
const { MONTH_PATTERN } = require('../../domain/absence');

/** Місяць 'YYYY-MM' */
const monthSchema = z.string().regex(MONTH_PATTERN, 'month must be in YYYY-MM format');

const positiveId = z.coerce
  .number({ error: 'Group ID must be a number' })
  .int('Group ID must be an integer')
  .positive('Group ID must be positive');

const attendanceRateSchema = z
  .preprocess(
    (val) => (typeof val === 'string' && val.trim() !== '' ? Number(val) : val),
    z
      .number({ error: 'attendanceRate must be a number' })
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
      .number({ error: 'Demand must be a number' })
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
          .number({ error: 'Target children count must be a number' })
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
    // Місяць прогнозу: від нього залежать робочі дні й харчування. За замовчуванням — поточний
    month: monthSchema.optional(),
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

const MAX_FORECAST_MONTHS = 36;
const MIN_FORECAST_YEAR = 1970; // нижня межа календаря (calendar.js)

/** POST /forecast/calendar: з якого місяця, на скільки місяців, з якою відвідуваністю */
const calendarForecastSchema = z.object({
  body: z
    .object({
      from: monthSchema
        .refine(
          (value) => Number(value.slice(0, 4)) >= MIN_FORECAST_YEAR,
          `from must be between ${MIN_FORECAST_YEAR}-01 and 9999-12`
        )
        .optional(),
      months: z
        .number({ error: 'months must be a number' })
        .int('months must be an integer')
        .min(1, 'months must be at least 1')
        .max(MAX_FORECAST_MONTHS, `months cannot exceed ${MAX_FORECAST_MONTHS}`)
        .optional(),
      attendanceRate: attendanceRateSchema,
    })
    .strict()
    .optional()
    .default({}),
});

module.exports = {
  groupProfitSchema,
  totalProfitSchema,
  forecastSchema,
  calendarForecastSchema,
  MAX_FORECAST_MONTHS,
  positiveId,
  attendanceRateSchema,
};
