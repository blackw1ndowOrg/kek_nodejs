const { z } = require('zod');

const parentIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, 'ID має бути цілим числом')
      .transform(Number),
  }),
});

const createParentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "ПІБ має містити щонайменше 2 символи")
    .max(100, "ПІБ занадто довге"),
  phone: z
    .string()
    .trim()
    .min(7, "Номер телефону занадто короткий")
    .max(20, "Номер телефону занадто довгий"),
  debt: z
    .number()
    .int("Борг має бути цілим числом (у копійках)")
    .min(0, "Борг не може бути від'ємним")
    .optional()
    .default(0),
  // Опціональне створення облікового запису користувача
  user: z
    .object({
      email: z.string().trim().toLowerCase().email("Некоректний формат email"),
      password: z.string().min(6, "Пароль має бути не менше 6 символів"),
    })
    .optional(),
});

const updateParentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "ПІБ має містити щонайменше 2 символи")
    .max(100, "ПІБ занадто довге")
    .optional(),
  phone: z
    .string()
    .trim()
    .min(7, "Номер телефону занадто короткий")
    .max(20, "Номер телефону занадто довгий")
    .optional(),
  debt: z
    .number()
    .int("Борг має бути цілим числом (у копійках)")
    .min(0, "Борг не може бути від'ємним")
    .optional(),
});

module.exports = {
  createParentSchema,
  updateParentSchema,
  parentIdParamSchema,
};
