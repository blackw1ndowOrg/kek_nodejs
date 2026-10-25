const { z } = require('zod');
const { DEFINITIONS_BY_CONSTANT, toConstantCase } = require('./settings.definitions');

const keySchema = z
  .string()
  .trim()
  .min(1, 'Setting key is required')
  .max(100, 'Setting key is too long')
  .regex(/^[A-Za-z0-9_]+$/, 'Key can only contain letters, numbers, and underscores');

// All setting values are non-negative integers (amounts in cents, percentages, limits) or arrays of them
const nonNegativeInt = z
  .number()
  .int('Value must be an integer')
  .nonnegative('Value cannot be negative');

const valueSchema = z.union([
  nonNegativeInt,
  z.array(nonNegativeInt).min(1, 'Array cannot be empty'),
]);

const keyParamsSchema = z.object({
  params: z.object({ key: keySchema }),
});

/**
 * Each key has its own boundaries (settings.definitions.js):
 * yearlyDiscountPercent 0-100, maxChildrenInGroup >= 1, money > 0, etc.
 * Unknown keys are skipped here — the service will return 404.
 * Keeps ZodObject (without .transform): validate() recognizes request schema by `.shape`.
 */
const updateSettingSchema = z
  .object({
    params: z.object({ key: keySchema }),
    body: z.object({ value: valueSchema }).strict(),
  })
  .superRefine(({ params, body }, ctx) => {
    const definition = DEFINITIONS_BY_CONSTANT[toConstantCase(params.key)];
    if (!definition) return;

    const result = definition.schema.safeParse(body.value);
    if (result.success) return;

    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: issue.message,
        path: ['body', 'value', ...issue.path],
      });
    }
  });

module.exports = { keySchema, valueSchema, keyParamsSchema, updateSettingSchema };