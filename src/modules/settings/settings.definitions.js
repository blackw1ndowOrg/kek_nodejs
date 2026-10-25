const { z } = require('zod');

// All amounts are stored in kopiykas/cents (Int). Upper limit protects against accidental extra zeros (10 mln UAH).
const MAX_MONEY = 1_000_000_000;
const MAX_PERCENT = 100;
const MAX_COUNT = 100;
const MAX_DISCOUNT_LEVELS = 10;

const integer = (label, min, max) =>
  z
    .number({ error: `${label}: must be a number` })
    .int(`${label}: must be an integer`)
    .min(min, `${label}: must be at least ${min}`)
    .max(max, `${label}: must be at most ${max}`);

const money = (label, min = 1) => integer(label, min, MAX_MONEY);
const percent = (label, min = 0) => integer(label, min, MAX_PERCENT);
const count = (label, min = 1) => integer(label, min, MAX_COUNT);

const discountLevelsSchema = z
  .array(percent('Discount level', 1), { error: 'Discount levels: must be an array' })
  .min(1, 'Discount levels: at least one level is required')
  .max(MAX_DISCOUNT_LEVELS, `Discount levels: cannot exceed ${MAX_DISCOUNT_LEVELS}`)
  .refine((levels) => new Set(levels).size === levels.length, 'Discount levels must be unique');

/**
 * Single source of truth for settings: DB key (camelCase, as in seed), default value, and validation rule.
 * Defaults are required for tests and as a fallback if the key is not yet in the DB.
 */
const SETTING_DEFINITIONS = Object.freeze({
  tuitionMonthly: { default: 1500000, schema: money('Monthly tuition') },
  yearlyDiscountPercent: { default: 12, schema: percent('Yearly payment discount') },
  discountLevels: { default: Object.freeze([10, 20, 30]), schema: discountLevelsSchema },
  mealBasePerDay: { default: 30000, schema: money('Base daily meal (2 years old)') },
  mealPerExtraYear: { default: 10000, schema: money('Meal extra per year', 0) },
  roomMonthlyCost: { default: 5000000, schema: money('Monthly room cost') },
  defaultRoomsCount: { default: 20, schema: count('Default rooms count') },
  maxChildrenInGroup: { default: 20, schema: count('Max children in group') },
  maxGroups: { default: 30, schema: count('Max groups') },
  groupExtraPayThreshold: { default: 12, schema: count('Extra pay threshold', 0) },
  educatorPerChild: { default: 200000, schema: money('Educator: rate per child') },
  educatorExtraPay: { default: 300000, schema: money('Educator: extra pay', 0) },
  assistantSalary: { default: 2000000, schema: money('Assistant: base salary') },
  assistantExtraPay: { default: 300000, schema: money('Assistant: extra pay', 0) },
  clubTeacherSalary: { default: 4000000, schema: money('Club teacher: base salary') },
  managerSalary: { default: 8000000, schema: money('Manager: base salary') },
});

const SETTING_KEYS = Object.freeze(Object.keys(SETTING_DEFINITIONS));

/**
 * Normalizes a key to CONSTANT_CASE.
 * 'tuitionMonthly' | 'TUITION_MONTHLY' | 'tuition-monthly' -> 'TUITION_MONTHLY'
 */
function toConstantCase(key) {
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

/** CONSTANT_CASE -> definition (used to look up the validation rule) */
const DEFINITIONS_BY_CONSTANT = Object.freeze(
  Object.fromEntries(
    SETTING_KEYS.map((dbKey) => [toConstantCase(dbKey), { dbKey, ...SETTING_DEFINITIONS[dbKey] }])
  )
);

module.exports = {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  DEFINITIONS_BY_CONSTANT,
  toConstantCase,
  MAX_MONEY,
};