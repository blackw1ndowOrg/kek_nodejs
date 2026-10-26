const { z } = require('zod');

const ROOM_TYPES = ['GROUP', 'CLUB'];

const roomIdParams = z.object({
  id: z.coerce.number().int('Некоректний id кімнати').positive('Некоректний id кімнати'),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Назва кімнати обовʼязкова')
  .max(100, 'Назва кімнати задовга');
const typeSchema = z.enum(ROOM_TYPES, 'type має бути GROUP або CLUB');
// Monthly room cost in kopiykas
const monthlyCostSchema = z
  .number()
  .int('Вартість має бути цілим числом копійок')
  .nonnegative('Вартість не може бути відʼємною');

const listRoomsSchema = z.object({
  query: z.object({ type: typeSchema.optional() }),
});

const roomIdSchema = z.object({ params: roomIdParams });

const createRoomSchema = z.object({
  body: z
    .object({ name: nameSchema, type: typeSchema, monthlyCost: monthlyCostSchema.optional() })
    .strict(),
});

const updateRoomSchema = z.object({
  params: roomIdParams,
  body: z
    .object({ name: nameSchema, type: typeSchema, monthlyCost: monthlyCostSchema })
    .partial()
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Потрібно вказати хоча б одне поле для зміни'),
});

module.exports = {
  ROOM_TYPES,
  roomIdParams,
  listRoomsSchema,
  roomIdSchema,
  createRoomSchema,
  updateRoomSchema,
};
