const { toMoney, KOPIYKAS_PER_UAH } = require('../../../src/domain/money');
const { BadRequestError } = require('../../../src/errors/AppError');

describe('Domain: Money (toMoney)', () => {
  test('експортує константу KOPIYKAS_PER_UAH = 100', () => {
    expect(KOPIYKAS_PER_UAH).toBe(100);
  });

  test('коректно конвертує додатну суму', () => {
    const result = toMoney(1500000);
    expect(result).toEqual({
      uah: 15000,
      hryvnias: 15000,
      kopecks: 1500000,
      kopiykas: 1500000,
    });
  });

  test('коректно конвертує суму з копійками', () => {
    const result = toMoney(12345);
    expect(result).toEqual({
      uah: 123.45,
      hryvnias: 123.45,
      kopecks: 12345,
      kopiykas: 12345,
    });
  });

  test('коректно конвертує 0', () => {
    const result = toMoney(0);
    expect(result).toEqual({
      uah: 0,
      hryvnias: 0,
      kopecks: 0,
      kopiykas: 0,
    });
  });

  test('коректно конвертує від’ємну суму', () => {
    const result = toMoney(-7000000);
    expect(result).toEqual({
      uah: -70000,
      hryvnias: -70000,
      kopecks: -7000000,
      kopiykas: -7000000,
    });
  });

  test.each([
    [12.34],
    ['1000'],
    [null],
    [undefined],
    [NaN],
    [Infinity],
    [{}],
  ])('кидає BadRequestError для нецілих або нечислових значень (%p)', (val) => {
    expect(() => toMoney(val)).toThrow(BadRequestError);
  });
});

