const { z } = require('zod');
const { MONTH_PATTERN } = require('../../domain/absence');

const PAYMENT_PLANS = ['MONTHLY', 'YEARLY'];

const childParamsSchema = z.object({
  childId: z.coerce.number().int('Некоректний id дитини').positive('Некоректний id дитини'),
});

const getChildBillingSchema = z.object({
  params: childParamsSchema,
  query: z.object({
    // місяць, за який рахувати харчування з урахуванням відсутностей; за замовчуванням поточний
    month: z.string().regex(MONTH_PATTERN, 'month має бути у форматі YYYY-MM').optional(),
  }),
});

const payChildSchema = z.object({
  params: childParamsSchema,
  body: z
    .object({ plan: z.enum(PAYMENT_PLANS, 'plan має бути MONTHLY або YEARLY').optional() })
    .strict()
    .optional(),
});

const getPriceTagSchema = getChildBillingSchema;

module.exports = {
  PAYMENT_PLANS,
  childParamsSchema,
  getChildBillingSchema,
  getPriceTagSchema,
  payChildSchema,
};
