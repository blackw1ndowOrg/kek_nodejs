const {
  applyPercentDiscount,
  calculateChildMonthlyTuition,
  tuitionMonthly,
  mealPerDay,
  mealMonthly,
  monthlyTotal,
  yearlyTotal,
  MIN_AGE,
  MAX_AGE,
} = require('../../../src/domain/pricing');
const { BadRequestError } = require('../../../src/errors/AppError');

describe('applyPercentDiscount', () => {
  test('коректно застосовує відсоткову знижку з округленням', () => {
    expect(applyPercentDiscount(1000000, 10)).toBe(900000);
    expect(applyPercentDiscount(1500000, 12)).toBe(1320000);
    expect(applyPercentDiscount(1500000, 0)).toBe(1500000);
  });
});

describe('calculateChildMonthlyTuition', () => {
  test('план MONTHLY повертає стандартну місячну вартість зі знижкою дитини', () => {
    expect(calculateChildMonthlyTuition(0, 'MONTHLY')).toBe(1500000);
    expect(calculateChildMonthlyTuition(10, 'MONTHLY')).toBe(1350000);
    expect(calculateChildMonthlyTuition(20, 'MONTHLY')).toBe(1200000);
    expect(calculateChildMonthlyTuition(30, 'MONTHLY')).toBe(1050000);
  });

  test('план YEARLY застосовує додаткову річну знижку 12%', () => {
    // 0% пільга: 1 500 000 * 0.88 = 1 320 000
    expect(calculateChildMonthlyTuition(0, 'YEARLY')).toBe(1320000);
    // 10% пільга: 1 350 000 * 0.88 = 1 188 000
    expect(calculateChildMonthlyTuition(10, 'YEARLY')).toBe(1188000);
    // 20% пільга: 1 200 000 * 0.88 = 1 056 000 (1/12 від річної вартості)
    expect(calculateChildMonthlyTuition(20, 'YEARLY')).toBe(1056000);
    // 30% пільга: 1 050 000 * 0.88 = 924 000
    expect(calculateChildMonthlyTuition(30, 'YEARLY')).toBe(924000);
  });

  test('підтримує передачу об’єкта дитини { discountPercent, paymentPlan }', () => {
    const childMonthly = { discountPercent: 20, paymentPlan: 'MONTHLY' };
    const childYearly = { discountPercent: 20, paymentPlan: 'YEARLY' };

    expect(calculateChildMonthlyTuition(childMonthly)).toBe(1200000);
    expect(calculateChildMonthlyTuition(childYearly)).toBe(1056000);
  });

  test('підтримує кастомні налаштування тарифу та зберігає розрахунок без обмеження discountLevels', () => {
    expect(calculateChildMonthlyTuition(0, 'YEARLY', 2000000, [10], 15)).toBe(1700000);
    // Виклик зі скороченим синтаксисом (child, tuition, discountLevels, yearlyDiscount)
    const childYearly = { discountPercent: 10, paymentPlan: 'YEARLY' };
    // 2 000 000 * 0.90 (пільга) = 1 800 000; 1 800 000 * 0.85 (15% річна знижка) = 1 530 000
    expect(calculateChildMonthlyTuition(childYearly, 2000000, [10, 20], 15)).toBe(1530000);

    // Збережена пільга 30% при discountLevels [10, 20]
    const childOldDiscount = { discountPercent: 30, paymentPlan: 'MONTHLY' };
    expect(calculateChildMonthlyTuition(childOldDiscount, 1500000, [10, 20])).toBe(1050000);
  });
});

describe('tuitionMonthly (копійки)', () => {
  test.each([
    [0, 1500000],
    [10, 1350000],
    [20, 1200000],
    [30, 1050000],
  ])('знижка %i%% -> %i', (discount, expected) => {
    expect(tuitionMonthly(discount)).toBe(expected);
  });

  test.each([-10, 105, 3.5, '20', undefined, null])('невалідна знижка %p -> BadRequestError', (discount) => {
    expect(() => tuitionMonthly(discount)).toThrow(BadRequestError);
  });

  test('зберігає розрахунок для збереженої знижки 30% навіть якщо discountLevels [10, 20]', () => {
    expect(tuitionMonthly(30, 1500000, [10, 20])).toBe(1050000);
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
    expect(() => yearlyTotal(4, -5)).toThrow(BadRequestError);
  });
});

describe('значення з налаштувань передаються параметрами', () => {
  test('MIN_AGE і MAX_AGE експортуються', () => {
    expect([MIN_AGE, MAX_AGE]).toEqual([2, 5]);
  });

  test('tuitionMonthly: розрахунок без обмеження за списком discountLevels', () => {
    expect(tuitionMonthly(10, 1000000)).toBe(900000);
    expect(tuitionMonthly(50, 1500000, [50])).toBe(750000);
    expect(tuitionMonthly(0, 1500000, [50])).toBe(1500000);
    expect(tuitionMonthly(10, 1500000, [50])).toBe(1350000);
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
