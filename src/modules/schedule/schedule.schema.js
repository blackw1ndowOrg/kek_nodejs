const { z } = require('zod');
const { ACTIVITY } = require('../../domain/schedule');

const groupParams = z.object({
  groupId: z.coerce.number().int('Некоректний id групи').positive('Некоректний id групи'),
});

const slotParams = z.object({
  id: z.coerce.number().int('Некоректний id слота').positive('Некоректний id слота'),
});

const groupScheduleSchema = z.object({ params: groupParams });

// Редагується день, час, активність (FREE_PLAY <-> CLUB) або гурток
const updateSlotSchema = z.object({
  params: slotParams,
  body: z
    .object({
      dayOfWeek: z
        .number()
        .int('dayOfWeek має бути цілим числом')
        .min(1, 'dayOfWeek: від 1 (пн) до 5 (пт)')
        .max(5, 'dayOfWeek: від 1 (пн) до 5 (пт)'),
      startMinute: z
        .number()
        .int('startMinute має бути цілим числом')
        .min(0, 'startMinute: від 0 до 1439')
        .max(1439, 'startMinute: від 0 до 1439'),
      endMinute: z
        .number()
        .int('endMinute має бути цілим числом')
        .min(1, 'endMinute: від 1 до 1440')
        .max(1440, 'endMinute: від 1 до 1440'),
      activity: z.enum([ACTIVITY.FREE_PLAY, ACTIVITY.CLUB], {
        message: 'activity може бути лише FREE_PLAY або CLUB',
      }),
      clubId: z
        .number()
        .int('clubId має бути цілим числом')
        .positive('clubId має бути додатним числом')
        .nullable(),
    })
    .partial()
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Потрібно вказати хоча б одне поле для зміни')
    .refine(
      (body) =>
        body.startMinute === undefined ||
        body.endMinute === undefined ||
        body.startMinute < body.endMinute,
      'Початок заняття має бути раніше за кінець'
    )
    .refine(
      (body) =>
        body.activity !== ACTIVITY.CLUB || (body.clubId !== undefined && body.clubId !== null),
      "Для activity CLUB обов'язково вказати clubId"
    )
    .refine(
      (body) => body.clubId !== null || body.activity === ACTIVITY.FREE_PLAY,
      'clubId може бути null лише при activity FREE_PLAY'
    ),
});

module.exports = { groupParams, slotParams, groupScheduleSchema, updateSlotSchema };
