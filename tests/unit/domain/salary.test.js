const {
  assertGroupSize,
  educatorSalary,
  assistantSalary,
  clubTeacherSalary,
  managerSalary,
} = require('../../../src/domain/salary');
const { BadRequestError } = require('../../../src/errors/AppError');

describe('salary (копійки)', () => {
  test.each([
    [0, 0, 2000000],
    [10, 2000000, 2000000],
    [12, 2400000, 2000000],
    [13, 2900000, 2300000],
    [20, 6400000, 4400000],
  ])('n=%i: вихователь %i, помічник %i', (n, educator, assistant) => {
    expect(educatorSalary(n)).toBe(educator);
    expect(assistantSalary(n)).toBe(assistant);
  });

  test.each([21, -1, 2.5, NaN, '10'])('n=%p -> BadRequestError', (n) => {
    expect(() => educatorSalary(n)).toThrow(BadRequestError);
    expect(() => assistantSalary(n)).toThrow(BadRequestError);
  });

  test('викладач гуртка — 40 000 грн, менеджер — 80 000 грн', () => {
    expect(clubTeacherSalary()).toBe(4000000);
    expect(managerSalary()).toBe(8000000);
  });
  test('вихователь: інша ставка, доплата й поріг', () => {
    // 1 000 · 12 + 2 000 · (12 − 10) = 16 000 грн
    expect(educatorSalary(12, 100000, 200000, 10)).toBe(1600000);
  });

  test('помічник: інша база, доплата й поріг', () => {
    // 15 000 + 1 000 · (12 − 10) = 17 000 грн
    expect(assistantSalary(12, 1500000, 100000, 10)).toBe(1700000);
  });

  test('фіксовані ставки', () => {
    expect(clubTeacherSalary(4500000)).toBe(4500000);
    expect(managerSalary(9000000)).toBe(9000000);
  });

  test('assertGroupSize: максимум за замовчуванням 20, можна передати інший', () => {
    expect(() => assertGroupSize(20)).not.toThrow();
    expect(() => assertGroupSize(21)).toThrow(BadRequestError);
    expect(() => assertGroupSize(25, 25)).not.toThrow();
  });
});
