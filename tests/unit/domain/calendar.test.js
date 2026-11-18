const {
  daysInMonth,
  workingDays,
  workingDaysInMonth,
  parseMonth,
  addMonths,
  monthSequence,
  currentMonth,
} = require('../../../src/domain/calendar');
const { mealMonthly } = require('../../../src/domain/pricing');
const { BadRequestError } = require('../../../src/errors/AppError');

// Свята із seed (чернетка списку для BA)
const HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-03-08',
  '2026-04-12',
  '2026-05-01',
  '2026-05-08',
  '2026-05-31',
  '2026-06-28',
  '2026-07-15',
  '2026-08-24',
  '2026-10-01',
  '2026-12-25',
];

describe('domain/calendar', () => {
  describe('daysInMonth', () => {
    test.each([
      [2026, 1, 31],
      [2026, 2, 28],
      [2026, 4, 30],
      [2024, 2, 29], // високосний
      [2028, 2, 29], // високосний
      [2100, 2, 28], // ділиться на 100, але не на 400
      [2000, 2, 29], // ділиться на 400
    ])('%i-%i -> %i днів', (year, month, days) => {
      expect(daysInMonth(year, month)).toBe(days);
    });
  });

  describe('workingDays: Пн–Пт без свят', () => {
    test.each([
      ['листопад 2026', 2026, 11, 21],
      ['лютий 2026 (починається в неділю)', 2026, 2, 20],
      ['лютий 2027', 2027, 2, 20],
      ['лютий 2028 (високосний, 29 днів)', 2028, 2, 21],
      ['лютий 2024 (високосний)', 2024, 2, 21],
      ['березень 2026', 2026, 3, 22],
      ['грудень 2026', 2026, 12, 23],
    ])('%s -> %i', (_name, year, month, days) => {
      expect(workingDays(year, month)).toBe(days);
    });
  });

  describe('workingDays зі святами', () => {
    test('листопад 2026: свят немає -> 21', () => {
      expect(workingDays(2026, 11, HOLIDAYS_2026)).toBe(21);
    });

    test.each([
      ['травень 2026: 1 і 8 травня — п’ятниці, Трійця — неділя', 2026, 5, 19],
      ['серпень 2026: 24 серпня — понеділок', 2026, 8, 20],
      ['грудень 2026: 25 грудня — п’ятниця', 2026, 12, 22],
      ['жовтень 2026: 1 жовтня — четвер', 2026, 10, 21],
    ])('%s -> %i', (_name, year, month, days) => {
      expect(workingDays(year, month, HOLIDAYS_2026)).toBe(days);
    });

    test('свято у вихідний не віднімається вдруге: 8 березня 2026 — неділя', () => {
      expect(workingDays(2026, 3, ['2026-03-08'])).toBe(22);
      expect(workingDays(2026, 3, HOLIDAYS_2026)).toBe(22);
    });

    test('дубль у списку не віднімається двічі', () => {
      expect(workingDays(2026, 8, ['2026-08-24', '2026-08-24'])).toBe(20);
    });

    test('свято з іншого місяця чи року не впливає', () => {
      expect(workingDays(2026, 11, ['2026-12-25', '2025-11-03'])).toBe(21);
    });

    test('свято 29 лютого у високосний рік', () => {
      expect(workingDays(2028, 2, ['2028-02-29'])).toBe(20); // вівторок
    });

    test('усі будні — свята -> 0 робочих днів, харчування 0', () => {
      const allWeekdays = Array.from(
        { length: 28 },
        (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`
      );
      const days = workingDays(2026, 2, allWeekdays);
      expect(days).toBe(0);
      expect(mealMonthly(3, days)).toBe(0);
    });
  });

  describe('валідація', () => {
    test.each([
      [2026, 0],
      [2026, 13],
      [2026, 1.5],
      [1969, 1],
      [10000, 1],
      ['2026', 1],
    ])('workingDays(%p, %p) -> 400', (year, month) => {
      expect(() => workingDays(year, month)).toThrow(BadRequestError);
    });

    test('свята не масивом -> 400', () => {
      expect(() => workingDays(2026, 11, '2026-11-02')).toThrow('Свята мають бути масивом');
    });
  });

  describe('місяць YYYY-MM', () => {
    test('parseMonth', () => {
      expect(parseMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    });

    test.each(['2026-13', '2026-1', '11-2026', ''])('parseMonth(%p) -> 400', (value) => {
      expect(() => parseMonth(value)).toThrow(BadRequestError);
    });

    test('workingDaysInMonth', () => {
      expect(workingDaysInMonth('2026-11')).toBe(21);
      expect(workingDaysInMonth('2026-05', HOLIDAYS_2026)).toBe(19);
    });

    test.each([
      ['2026-11', 0, '2026-11'],
      ['2026-11', 1, '2026-12'],
      ['2026-11', 2, '2027-01'],
      ['2026-11', 14, '2028-01'],
      ['2026-01', -1, '2025-12'],
    ])('addMonths(%s, %i) -> %s', (from, count, expected) => {
      expect(addMonths(from, count)).toBe(expected);
    });

    test.each([
      ['9999-12', 1],
      ['1970-01', -1],
      ['0001-01', 0],
    ])('addMonths(%s, %i) поза 1970–9999 -> 400 з роком у тексті', (from, count) => {
      expect(() => addMonths(from, count)).toThrow(/Рік має бути цілим числом від 1970 до 9999/);
    });

    test('monthSequence: місяці поспіль через межу року', () => {
      expect(monthSequence('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    });

    test.each([0, -1, 1.5])('monthSequence з кількістю %p -> 400', (count) => {
      expect(() => monthSequence('2026-11', count)).toThrow(BadRequestError);
    });
  });

  describe('currentMonth: межі місяця за Києвом', () => {
    test('31.10 о 23:30 за Києвом — ще жовтень', () => {
      expect(currentMonth(new Date('2026-10-31T21:30:00Z'))).toBe('2026-10');
    });

    test('у UTC ще 31.10, а в Києві вже листопад', () => {
      expect(currentMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11');
    });

    test('без аргументу — поточний момент', () => {
      expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    });
  });
});
