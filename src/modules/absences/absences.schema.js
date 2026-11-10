const { z } = require('zod');
const { MONTH_PATTERN } = require('../../domain/absence');

// Лише форма запиту. Правила (вихідний, минула дата, дубль, чия дитина) перевіряє absences.service.js

/** Додатне ціле з URL; одне повідомлення і для «abc», і для «-1» */
const idParam = (message) => z.coerce.number({ error: message }).int(message).positive(message);

const childParams = z.object({ childId: idParam('Некоректний id дитини') });

const absenceParams = childParams.extend({ absenceId: idParam('Некоректний id відсутності') });

const createAbsenceSchema = z.object({
  params: childParams,
  // notifiedAt ставить сервер; .strict() не дає клієнту його передати
  body: z.object({ date: z.iso.date('date має бути у форматі YYYY-MM-DD') }).strict(),
});

const listAbsencesSchema = z.object({
  params: childParams,
  query: z.object({
    month: z.string().regex(MONTH_PATTERN, 'month має бути у форматі YYYY-MM').optional(),
  }),
});

const deleteAbsenceSchema = z.object({ params: absenceParams });

module.exports = { createAbsenceSchema, listAbsencesSchema, deleteAbsenceSchema };
