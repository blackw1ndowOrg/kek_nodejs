const {
  keySchema,
  valueSchema,
  keyParamsSchema,
  updateSettingSchema,
} = require('../../../src/modules/settings/settings.schema');

describe('keySchema', () => {
  test.each(['TUITION_MONTHLY', 'tuitionMonthly', 'key1', 'a'])('%p -> валідно', (key) => {
    expect(keySchema.safeParse(key).success).toBe(true);
  });

  test('пробіли по краях обрізаються', () => {
    expect(keySchema.parse('  tuitionMonthly ')).toBe('tuitionMonthly');
  });

  test('рівно 100 символів -> валідно', () => {
    expect(keySchema.safeParse('a'.repeat(100)).success).toBe(true);
  });

  test.each([
    ['порожній', ''],
    ['лише пробіли', '   '],
    ['101 символ', 'a'.repeat(101)],
    ['дефіс', 'tuition-monthly'],
    ['пробіл усередині', 'tuition monthly'],
    ['крапка', 'a.b'],
    ['кирилиця', 'ключ'],
  ])('%s -> помилка', (_name, key) => {
    expect(keySchema.safeParse(key).success).toBe(false);
  });
});

describe('valueSchema', () => {
  test.each([[0], [5], [1500000], [[1]], [[10, 20, 30]], [[0, 5]]])('%j -> валідно', (value) => {
    expect(valueSchema.safeParse(value).success).toBe(true);
  });

  test.each([
    ['від’ємне', -1],
    ['дробове', 1.5],
    ['рядок', '5'],
    ['null', null],
    ['порожній масив', []],
    ['масив із від’ємним', [1, -1]],
    ['масив із дробовим', [1.5]],
    ['масив рядків', ['1']],
    ['об’єкт', { a: 1 }],
  ])('%s -> помилка', (_name, value) => {
    expect(valueSchema.safeParse(value).success).toBe(false);
  });
});

describe('keyParamsSchema', () => {
  test('валідний ключ', () => {
    expect(keyParamsSchema.parse({ params: { key: 'tuitionMonthly' } })).toEqual({
      params: { key: 'tuitionMonthly' },
    });
  });

  test('невалідний ключ -> помилка', () => {
    expect(keyParamsSchema.safeParse({ params: { key: 'a-b' } }).success).toBe(false);
  });
});

describe('updateSettingSchema', () => {
  const parse = (key, value) => updateSettingSchema.safeParse({ params: { key }, body: { value } });

  test('відомий ключ із валідним значенням', () => {
    expect(updateSettingSchema.parse({ params: { key: 'TUITION_MONTHLY' }, body: { value: 1600000 } }))
      .toEqual({ params: { key: 'TUITION_MONTHLY' }, body: { value: 1600000 } });
  });

  test('ключ обрізається від пробілів', () => {
    const { params } = updateSettingSchema.parse({
      params: { key: ' tuitionMonthly ' },
      body: { value: 100 },
    });
    expect(params.key).toBe('tuitionMonthly');
  });

  test.each(['yearlyDiscountPercent', 'YEARLY_DISCOUNT_PERCENT'])(
    'правило конкретного ключа застосовується для запису %s',
    (key) => {
      expect(parse(key, 100).success).toBe(true);
      const result = parse(key, 101);
      expect(result.success).toBe(false);
      expect(result.error.issues[0]).toMatchObject({
        message: 'Yearly payment discount: must be at most 100',
        path: ['body', 'value'],
      });
    }
  );

  test.each([
    ['тариф 0', 'TUITION_MONTHLY', 0],
    ['тариф вище максимуму', 'TUITION_MONTHLY', 1_000_000_001],
    ['ліміт дітей 0', 'MAX_CHILDREN_IN_GROUP', 0],
    ['ліміт дітей 101', 'MAX_CHILDREN_IN_GROUP', 101],
  ])('%s -> помилка', (_name, key, value) => {
    expect(parse(key, value).success).toBe(false);
  });

  test('значення 0 допустиме там, де мінімум 0', () => {
    expect(parse('MEAL_PER_EXTRA_YEAR', 0).success).toBe(true);
    expect(parse('GROUP_EXTRA_PAY_THRESHOLD', 0).success).toBe(true);
  });

  test('рівні знижок: валідний масив', () => {
    expect(parse('DISCOUNT_LEVELS', [5, 15]).success).toBe(true);
  });

  test('рівні знижок: помилка елемента містить індекс у path', () => {
    const result = parse('DISCOUNT_LEVELS', [10, 0]);
    expect(result.success).toBe(false);
    expect(result.error.issues[0]).toMatchObject({
      message: 'Discount level: must be at least 1',
      path: ['body', 'value', 1],
    });
  });

  test('рівні знижок: дублікати', () => {
    const result = parse('DISCOUNT_LEVELS', [10, 10]);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Discount levels must be unique');
  });

  test('невідомий ключ пропускається (404 поверне сервіс)', () => {
    expect(parse('UNKNOWN_KEY', 5).success).toBe(true);
  });

  test.each([
    ['без value', {}],
    ['зайве поле', { value: 5, extra: 1 }],
    ['value рядком', { value: '5' }],
    ['від’ємне value', { value: -1 }],
    ['порожній масив', { value: [] }],
  ])('тіло: %s -> помилка', (_name, body) => {
    expect(updateSettingSchema.safeParse({ params: { key: 'UNKNOWN_KEY' }, body }).success).toBe(
      false
    );
  });

  test('невалідний ключ -> помилка', () => {
    expect(parse('bad-key', 5).success).toBe(false);
  });
});
