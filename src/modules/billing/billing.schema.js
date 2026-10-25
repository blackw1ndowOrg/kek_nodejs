const { z } = require('zod');

const PAYMENT_PLANS = ['MONTHLY', 'YEARLY'];

const childParamsSchema = z.object({
  childId: z.coerce.number().int('Некоректний id дитини').positive('Некоректний id дитини'),
});

const getChildBillingSchema = z.object({
  params: childParamsSchema,
});

const payChildSchema = z.object({
  params: childParamsSchema,
  body: z
    .object({ plan: z.enum(PAYMENT_PLANS, 'plan має бути MONTHLY або YEARLY').optional() })
    .strict()
    .optional(),
});

module.exports = { PAYMENT_PLANS, childParamsSchema, getChildBillingSchema, payChildSchema };
