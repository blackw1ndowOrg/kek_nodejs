const {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  DEFINITIONS_BY_CONSTANT,
  toConstantCase,
  MAX_MONEY,
} = require('../../../src/modules/settings/settings.definitions');

describe('toConstantCase', () => {
  test.each([
    ['tuitionMonthly', 'TUITION_MONTHLY'],
    ['TUITION_MONTHLY', 'TUITION_MONTHLY'],
    ['tuition-monthly', 'TUITION_MONTHLY'],
    ['tuition monthly', 'TUITION_MONTHLY'],
    ['  maxChildrenInGroup  ', 'MAX_CHILDREN_IN_GROUP'],
    ['maxGroups', 'MAX_GROUPS'],
    ['a1B', 'A1_B'],
    ['tuition', 'TUITION'],
  ])('%p -> %p', (input, expected) => {
    expect(toConstantCase(input)).toBe(expected);
  });

  test('нерядкове значення приводиться до рядка', () => {
    expect(toConstantCase(123)).toBe('123');
  });
});

describe('SETTING_DEFINITIONS, SETTING_KEYS, DEFINITIONS_BY_CONSTANT', () => {
  test('SETTING_KEYS збігається з ключами визначень', () => {
    expect(SETTING_KEYS).toEqual(Object.keys(SETTING_DEFINITIONS));
    expect(SETTING_KEYS).toHaveLength(16);
  });

  test('усе заморожено', () => {
    expect(Object.isFrozen(SETTING_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(SETTING_KEYS)).toBe(true);
    expect(Object.isFrozen(DEFINITIONS_BY_CONSTANT)).toBe(true);
    expect(Object.isFrozen(SETTING_DEFINITIONS.discountLevels.default)).toBe(true);
  });

  test('DEFINITIONS_BY_CONSTANT: ключі в CONSTANT_CASE, зберігають dbKey', () => {
    expect(DEFINITIONS_BY_CONSTANT.TUITION_MONTHLY).toMatchObject({
      dbKey: 'tuitionMonthly',
      default: 1500000,
    });
    expect(DEFINITIONS_BY_CONSTANT.MAX_CHILDREN_IN_GROUP.dbKey).toBe('maxChildrenInGroup');
    expect(Object.keys(DEFINITIONS_BY_CONSTANT)).toEqual(SETTING_KEYS.map(toConstantCase));
  });

  test.each(SETTING_KEYS)('значення за замовчуванням для %s проходить власну схему', (key) => {
    const { default: value, schema } = SETTING_DEFINITIONS[key];
    expect(schema.safeParse(value).success).toBe(true);
  });
});

const MONEY_MIN_1 = {
  valid: [1, 1500, MAX_MONEY],
  invalid: [0, -1, MAX_MONEY + 1, 10.5, '100', null],
};
const MONEY_MIN_0 = {
  valid: [0, 1500, MAX_MONEY],
  invalid: [-1, MAX_MONEY + 1, 10.5, '100', null],
};
const COUNT_MIN_1 = { valid: [1, 20, 100], invalid: [0, -1, 101, 1.5, '5'] };
const COUNT_MIN_0 = { valid: [0, 12, 100], invalid: [-1, 101, 1.5, '5'] };

const RULES = {
  tuitionMonthly: MONEY_MIN_1,
  yearlyDiscountPercent: { valid: [0, 12, 100], invalid: [-1, 101, 1.5, '12'] },
  mealBasePerDay: MONEY_MIN_1,
  mealPerExtraYear: MONEY_MIN_0,
  roomMonthlyCost: MONEY_MIN_1,
  defaultRoomsCount: COUNT_MIN_1,
  maxChildrenInGroup: COUNT_MIN_1,
  maxGroups: COUNT_MIN_1,
  groupExtraPayThreshold: COUNT_MIN_0,
  educatorPerChild: MONEY_MIN_1,
  educatorExtraPay: MONEY_MIN_0,
  assistantSalary: MONEY_MIN_1,
  assistantExtraPay: MONEY_MIN_0,
  clubTeacherSalary: MONEY_MIN_1,
  managerSalary: MONEY_MIN_1,
};

describe('правила валідації числових налаштувань', () => {
  test('кожне налаштування, крім discountLevels, має тут правила', () => {
    expect(Object.keys(RULES).sort()).toEqual(
      SETTING_KEYS.filter((key) => key !== 'discountLevels').sort()
    );
  });

  describe.each(Object.entries(RULES))('%s', (key, { valid, invalid }) => {
    const { schema } = SETTING_DEFINITIONS[key];

    test.each(valid)('%p -> валідно', (value) => {
      expect(schema.safeParse(value).success).toBe(true);
    });

    test.each(invalid)('%p -> помилка', (value) => {
      expect(schema.safeParse(value).success).toBe(false);
    });
  });

  test('повідомлення про помилки містять назву поля', () => {
    const { schema } = SETTING_DEFINITIONS.tuitionMonthly;
    expect(schema.safeParse('x').error.issues[0].message).toBe('Monthly tuition: must be a number');
    expect(schema.safeParse(1.5).error.issues[0].message).toBe(
      'Monthly tuition: must be an integer'
    );
    expect(schema.safeParse(0).error.issues[0].message).toBe('Monthly tuition: must be at least 1');
    expect(schema.safeParse(MAX_MONEY + 1).error.issues[0].message).toBe(
      `Monthly tuition: must be at most ${MAX_MONEY}`
    );
  });
});

describe('discountLevels', () => {
  const { schema } = SETTING_DEFINITIONS.discountLevels;
  const levels = (n) => Array.from({ length: n }, (_, i) => i + 1);

  test.each([[[10]], [[10, 20, 30]], [levels(10)], [[100]]])('%j -> валідно', (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  test.each([
    ['порожній масив', []],
    ['більше 10 рівнів', levels(11)],
    ['рівень 0', [0]],
    ['рівень більший за 100', [101]],
    ['дробовий рівень', [1.5]],
    ['не масив', 10],
    ['рядок', 'abc'],
  ])('%s -> помилка', (_name, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  test('дублікати -> помилка з поясненням', () => {
    const result = schema.safeParse([10, 20, 10]);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Discount levels must be unique');
  });

  test('не масив -> повідомлення про тип', () => {
    expect(schema.safeParse(5).error.issues[0].message).toBe('Discount levels: must be an array');
  });
});
