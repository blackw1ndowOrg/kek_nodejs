const { z } = require('zod');

const parentIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, 'ID має бути цілим числом')
      .transform(Number),
  }),
});

const parentsQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
  }),
});

const phoneSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s\-()]/g, ''))
  .refine(
    (val) => /^\+?[0-9]{10,15}$/.test(val),
    'Некоректний формат номера телефону (має бути 10-15 цифр)'
  );

const createParentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ПІБ має містити щонайменше 2 символи')
    .max(100, 'ПІБ занадто довге'),
  phone: phoneSchema,
  debt: z
    .number()
    .int('Борг має бути цілим числом (у копійках)')
    .min(0, "Борг не може бути від'ємним")
    .optional()
    .default(0),
  user: z
    .object({
      email: z.string().trim().toLowerCase().email('Некоректний формат email'),
      password: z.string().min(6, 'Пароль має бути не менше 6 символів'),
    })
    .optional(),
});

const updateParentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ПІБ має містити щонайменше 2 символи')
    .max(100, 'ПІБ занадто довге')
    .optional(),
  phone: phoneSchema.optional(),
  debt: z
    .number()
    .int('Борг має бути цілим числом (у копійках)')
    .min(0, "Борг не може бути від'ємним")
    .optional(),
});

const updateParentRouteSchema = z.object({
  params: parentIdParamSchema.shape.params,
  body: updateParentSchema,
});

module.exports = {
  createParentSchema,
  updateParentSchema,
  updateParentRouteSchema,
  parentIdParamSchema,
  parentsQuerySchema,
};
