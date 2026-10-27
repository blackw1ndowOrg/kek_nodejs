const { z } = require('zod');
const { MIN_AGE, MAX_AGE } = require('../../domain/pricing');

// Лише форма запиту. Бізнес-правила (вільна кімната, тип персоналу, вік дитини, ліміт дітей)
// перевіряє group.service.js.

const MAX_NAME_LENGTH = 100;

const positiveId = z.coerce.number().int().positive();
const groupAge = z.number().int().min(MIN_AGE).max(MAX_AGE);

const idParams = z.object({ id: positiveId });

const groupIdSchema = z.object({ params: idParams });

const listGroupsSchema = z.object({
  query: z.object({
    age: z.coerce.number().int().min(MIN_AGE).max(MAX_AGE).optional(),
  }),
});

const createGroupSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
      age: groupAge,
      roomId: z.number().int().positive(),
      educatorId: z.number().int().positive().nullable().optional(),
      assistantId: z.number().int().positive().nullable().optional(),
    })
    .strict(),
});

// null у educatorId/assistantId — зняти працівника з групи
const updateGroupSchema = z.object({
  params: idParams,
  body: z
    .object({
      name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
      age: groupAge.optional(),
      roomId: z.number().int().positive().optional(),
      educatorId: z.number().int().positive().nullable().optional(),
      assistantId: z.number().int().positive().nullable().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

const enrollChildSchema = z.object({
  params: idParams,
  body: z.object({ childId: z.number().int().positive() }).strict(),
});

const groupChildSchema = z.object({
  params: z.object({ id: positiveId, childId: positiveId }),
});

module.exports = {
  groupIdSchema,
  listGroupsSchema,
  createGroupSchema,
  updateGroupSchema,
  enrollChildSchema,
  groupChildSchema,
};
