const {
  startOfUtcDay,
  addMonthsUtc,
  toIsoDate,
} = require('../../../src/modules/billing/billing.dates');

const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);

describe('startOfUtcDay', () => {
  test('обнуляє час, лишає дату за UTC', () => {
    expect(startOfUtcDay(new Date('2026-10-26T23:59:59.999Z')).toISOString()).toBe(
      '2026-10-26T00:00:00.000Z'
    );
  });

  test('опівніч лишається опівніччю', () => {
    expect(startOfUtcDay(utc('2026-01-01')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('не мутує вхідну дату', () => {
    const input = new Date('2026-10-26T15:00:00Z');
    startOfUtcDay(input);
    expect(input.toISOString()).toBe('2026-10-26T15:00:00.000Z');
  });
});

describe('addMonthsUtc', () => {
  test.each([
    ['звичайний місяць', '2026-10-26', 1, '2026-11-26'],
    ['рік (12 місяців)', '2026-10-26', 12, '2027-10-26'],
    ['перехід через рік', '2026-12-15', 1, '2027-01-15'],
    ['31 січня + 1 -> 28 лютого', '2026-01-31', 1, '2026-02-28'],
    ['31 січня + 1 у високосний рік -> 29 лютого', '2028-01-31', 1, '2028-02-29'],
    ['31 березня + 1 -> 30 квітня', '2026-03-31', 1, '2026-04-30'],
    ['29 лютого + 12 -> 28 лютого', '2028-02-29', 12, '2029-02-28'],
    ['0 місяців', '2026-10-26', 0, '2026-10-26'],
  ])('%s', (_name, from, months, expected) => {
    expect(toIsoDate(addMonthsUtc(utc(from), months))).toBe(expected);
  });

  test('не мутує вхідну дату', () => {
    const input = utc('2026-01-31');
    addMonthsUtc(input, 1);
    expect(toIsoDate(input)).toBe('2026-01-31');
  });
});

describe('toIsoDate', () => {
  test('форматує як YYYY-MM-DD', () => {
    expect(toIsoDate(new Date('2026-10-26T18:45:00Z'))).toBe('2026-10-26');
  });

  test.each([null, undefined])('%p -> null', (value) => {
    expect(toIsoDate(value)).toBeNull();
  });
});
