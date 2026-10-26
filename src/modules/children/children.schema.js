const { z } = require('zod');
const { PaymentPlan } = require('@prisma/client');

// Лише форма запиту: типи й обов'язковість полів. Бізнес-правила (вік на 1 вересня,
// дозволені знижки, хто що може змінювати) перевіряє children.service.js.

const MAX_FULL_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
const MAX_PERCENT = 100;

const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

const childIdSchema = z.object({ params: idParams });

const listChildrenSchema = z.object({
  query: z.object({
    groupId: z.coerce.number().int().positive().optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  }),
});

const childFields = {
  fullName: z.string().trim().min(1).max(MAX_FULL_NAME_LENGTH),
  // 'YYYY-MM-DD' -> Date: Prisma для поля @db.Date чекає саме Date
  birthDate: z.iso.date().transform((value) => new Date(value)),
  notes: z.string().trim().max(MAX_NOTES_LENGTH),
  paymentPlan: z.enum(PaymentPlan),
  discountPercent: z.number().int().min(0).max(MAX_PERCENT),
  hasDeputyRelatives: z.boolean(),
};

const createChildSchema = z.object({
  body: z
    .object({
      fullName: childFields.fullName,
      birthDate: childFields.birthDate,
      notes: childFields.notes.optional(),
      paymentPlan: childFields.paymentPlan.optional(),
      discountPercent: childFields.discountPercent.optional(),
      hasDeputyRelatives: childFields.hasDeputyRelatives.optional(),
      parentIds: z.array(z.number().int().positive()).min(1),
    })
    .strict(),
});

const updateChildSchema = z.object({
  params: idParams,
  body: z
    .object({
      fullName: childFields.fullName.optional(),
      birthDate: childFields.birthDate.optional(),
      notes: childFields.notes.nullable().optional(), // null — стерти примітку
      paymentPlan: childFields.paymentPlan.optional(),
      discountPercent: childFields.discountPercent.optional(),
      hasDeputyRelatives: childFields.hasDeputyRelatives.optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

module.exports = {
  childIdSchema,
  listChildrenSchema,
  createChildSchema,
  updateChildSchema,
};
