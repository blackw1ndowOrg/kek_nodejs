const {
  createAbsenceSchema,
  listAbsencesSchema,
  deleteAbsenceSchema,
} = require('../../../src/modules/absences/absences.schema');

const firstMessage = (result) => result.error.issues[0].message;

describe('absences.schema', () => {
  describe('createAbsenceSchema', () => {
    const parse = (body, childId = '5') =>
      createAbsenceSchema.safeParse({ params: { childId }, body });

    test('дата лишається рядком, childId стає числом', () => {
      const result = parse({ date: '2026-11-12' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ params: { childId: 5 }, body: { date: '2026-11-12' } });
    });

    test.each(['12.11.2026', '2026-11-31', '2026-11-12T08:00:00Z', ''])(
      'date %p -> помилка',
      (date) => {
        const result = parse({ date });
        expect(result.success).toBe(false);
        expect(firstMessage(result)).toBe('date має бути у форматі YYYY-MM-DD');
      }
    );

    test('без date -> помилка', () => {
      expect(parse({}).success).toBe(false);
    });

    test('notifiedAt передати не можна: його ставить сервер', () => {
      expect(parse({ date: '2026-11-12', notifiedAt: '2026-11-01T00:00:00Z' }).success).toBe(false);
    });

    test.each(['abc', '0', '-3'])('childId %p -> помилка українською', (childId) => {
      const result = parse({ date: '2026-11-12' }, childId);
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe('Некоректний id дитини');
    });
  });

  describe('listAbsencesSchema', () => {
    const parse = (query) => listAbsencesSchema.safeParse({ params: { childId: '5' }, query });

    test('month необов’язковий', () => {
      expect(parse({}).data.query).toEqual({});
      expect(parse({ month: '2026-10' }).data.query).toEqual({ month: '2026-10' });
    });

    test.each(['2026-13', '2026-1', '10-2026'])('month %p -> помилка', (month) => {
      const result = parse({ month });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe('month має бути у форматі YYYY-MM');
    });
  });

  describe('deleteAbsenceSchema', () => {
    test('обидва id стають числами', () => {
      expect(
        deleteAbsenceSchema.parse({ params: { childId: '5', absenceId: '7' } }).params
      ).toEqual({ childId: 5, absenceId: 7 });
    });

    test('некоректний absenceId -> помилка українською', () => {
      const result = deleteAbsenceSchema.safeParse({ params: { childId: '5', absenceId: 'x' } });
      expect(firstMessage(result)).toBe('Некоректний id відсутності');
    });
  });
});
