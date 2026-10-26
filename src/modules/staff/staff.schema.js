const { z } = require('zod');

const staffIdParamSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, 'ID має бути цілим числом')
      .transform(Number),
  }),
});

const staffTypeEnum = z.enum(['EDUCATOR', 'ASSISTANT', 'CLUB_TEACHER', 'MANAGER'], {
  // istanbul ignore next
  errorMap: /* istanbul ignore next */ () => ({
    message: 'Посада має бути однією з: EDUCATOR, ASSISTANT, CLUB_TEACHER, MANAGER',
  }),
});

const staffQuerySchema = z.object({
  query: z.object({
    type: staffTypeEnum.optional(),
    isActive: z
      .enum(['true', 'false'], {
        // istanbul ignore next
        errorMap: /* istanbul ignore next */ () => ({
          message: 'isActive має бути "true" або "false"',
        }),
      })
      .transform((val) => val === 'true')
      .optional(),
    search: z.string().trim().optional(),
  }),
});

const createStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ПІБ має містити щонайменше 2 символи')
    .max(100, 'ПІБ занадто довге'),
  type: staffTypeEnum,
  isActive: z.boolean().optional().default(true),
  user: z
    .object({
      email: z.string().trim().toLowerCase().email('Некоректний формат email'),
      password: z.string().min(6, 'Пароль має бути не менше 6 символів'),
    })
    .optional(),
});

const updateStaffSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ПІБ має містити щонайменше 2 символи')
    .max(100, 'ПІБ занадто довге')
    .optional(),
  type: staffTypeEnum.optional(),
  isActive: z.boolean().optional(),
});

const updateStaffRouteSchema = z.object({
  params: staffIdParamSchema.shape.params,
  body: updateStaffSchema,
});

module.exports = {
  staffIdParamSchema,
  staffQuerySchema,
  createStaffSchema,
  updateStaffSchema,
  updateStaffRouteSchema,
  staffTypeEnum,
};
