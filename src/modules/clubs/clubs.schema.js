const { z } = require('zod');

const clubIdParams = z.object({
  id: z.coerce.number().int('Некоректний id гуртка').positive('Некоректний id гуртка'),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Назва гуртка обовʼязкова')
  .max(100, 'Назва гуртка задовга');
const roomIdSchema = z
  .number()
  .int('roomId має бути цілим числом')
  .positive('roomId має бути додатним числом');
const teacherIdSchema = z
  .number()
  .int('teacherId має бути цілим числом')
  .positive('teacherId має бути додатним числом');

const clubIdSchema = z.object({ params: clubIdParams });

const createClubSchema = z.object({
  body: z.object({ name: nameSchema, roomId: roomIdSchema, teacherId: teacherIdSchema }).strict(),
});

const updateClubSchema = z.object({
  params: clubIdParams,
  body: z
    .object({ name: nameSchema, roomId: roomIdSchema, teacherId: teacherIdSchema })
    .partial()
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Потрібно вказати хоча б одне поле для зміни'),
});

module.exports = { clubIdParams, clubIdSchema, createClubSchema, updateClubSchema };
