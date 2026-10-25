const {
  tuitionMonthly,
  mealPerDay,
  mealMonthly,
  monthlyTotal,
  yearlyTotal,
  MIN_AGE,
  MAX_AGE,
} = require('../../../src/domain/pricing');
const { BadRequestError } = require('../../../src/errors/AppError');

describe('tuitionMonthly (копійки)', () => {
  test.each([
    [0, 1500000],
    [10, 1350000],
    [20, 1200000],
    [30, 1050000],
  ])('знижка %i%% -> %i', (discount, expected) => {
    expect(tuitionMonthly(discount)).toBe(expected);
  });

  test.each([15, 40, -10, '20', undefined])('знижка %p -> BadRequestError', (discount) => {
    expect(() => tuitionMonthly(discount)).toThrow(BadRequestError);
  });
});

describe('mealPerDay (копійки)', () => {
  test.each([
    [2, 30000],
    [3, 40000],
    [4, 50000],
    [5, 60000],
  ])('%i роки -> %i', (age, expected) => {
    expect(mealPerDay(age)).toBe(expected);
  });

  test.each([1, 6, 3.5, '4'])('вік %p -> BadRequestError', (age) => {
    expect(() => mealPerDay(age)).toThrow(BadRequestError);
  });
});

describe('mealMonthly', () => {
  test('за замовчуванням 21 робочий день', () => {
    expect(mealMonthly(4)).toBe(1050000);
  });

  test('можна передати іншу кількість днів', () => {
    expect(mealMonthly(2, 20)).toBe(600000);
    expect(mealMonthly(2, 0)).toBe(0);
  });

  test.each([-1, 2.5])('днів %p -> BadRequestError', (days) => {
    expect(() => mealMonthly(4, days)).toThrow(BadRequestError);
  });

  test.each([0, 10, 20, 30])('знижка %i%% не впливає на харчування', (discount) => {
    expect(monthlyTotal(4, discount) - tuitionMonthly(discount)).toBe(mealMonthly(4));
  });
});

describe('кейс із ТЗ: 4 роки, знижка 20%', () => {
  test('за місяць — 22 500 грн', () => {
    expect(monthlyTotal(4, 20)).toBe(2250000);
  });

  test('за рік — 252 720 грн (знижка 12% на навчання, харчування без знижки)', () => {
    expect(yearlyTotal(4, 20)).toBe(25272000);
  });
});

describe('yearlyTotal', () => {
  test.each([
    [2, 0, 23400000],
    [5, 30, 26208000],
  ])('%i роки, знижка %i%% -> %i', (age, discount, expected) => {
    expect(yearlyTotal(age, discount)).toBe(expected);
  });

  test('невалідні дані -> BadRequestError', () => {
    expect(() => yearlyTotal(6, 0)).toThrow(BadRequestError);
    expect(() => yearlyTotal(4, 15)).toThrow(BadRequestError);
  });
});

describe('значення з налаштувань передаються параметрами', () => {
  test('MIN_AGE і MAX_AGE експортуються', () => {
    expect([MIN_AGE, MAX_AGE]).toEqual([2, 5]);
  });

  test('tuitionMonthly: інша ціна й інші рівні пільг, 0 дозволено завжди', () => {
    expect(tuitionMonthly(10, 1000000)).toBe(900000);
    expect(tuitionMonthly(50, 1500000, [50])).toBe(750000);
    expect(tuitionMonthly(0, 1500000, [50])).toBe(1500000);
    expect(() => tuitionMonthly(10, 1500000, [50])).toThrow(BadRequestError);
  });

  test('mealPerDay: інша база і крок', () => {
    expect(mealPerDay(4, 20000, 5000)).toBe(30000);
  });

  test('mealMonthly: днів і ціни передаються далі в mealPerDay', () => {
    expect(mealMonthly(4, 20, 20000, 5000)).toBe(600000);
  });

  test('monthlyTotal: усі параметри доходять до складових', () => {
    // навчання 10 000 · 0,5 = 5 000 грн; харчування (200 + 50 · 2) · 20 = 6 000 грн
    expect(monthlyTotal(4, 50, 1000000, [50], 20000, 5000, 20)).toBe(1100000);
  });

  test('yearlyTotal: усі параметри доходять до складових', () => {
    // навчання 10 000 · 12 · 0,9 = 108 000 грн; харчування 300 · 200 = 60 000 грн
    expect(yearlyTotal(4, 0, 1000000, [10], 10, 20000, 5000, 200)).toBe(16800000);
  });
});
