const { BadRequestError } = require('../errors/AppError');

// Ціни для батьків, всі суми в копійках.
// Множимо до ділення, щоб не мати похибок float (замість * 0.88 — * 88 / 100).
// Ціни, знижки й робочі дні приходять параметрами (значення з таблиці Setting);
// значення за замовчуванням — з ТЗ.
const MIN_AGE = 2;
const MAX_AGE = 5;
const NO_DISCOUNT = 0; // без пільги можна завжди, у discountLevels лише пільгові рівні
const MONTHS_PER_YEAR = 12;
const PERCENT_BASE = 100;

function assertDiscount(discountPercent, discountLevels) {
  const allowed = [NO_DISCOUNT, ...discountLevels];
  if (!allowed.includes(discountPercent)) {
    throw new BadRequestError(`Discount must be one of ${allowed.join(', ')}: ${discountPercent}`);
  }
}

function assertAge(age) {
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw new BadRequestError(`Age must be an integer from ${MIN_AGE} to ${MAX_AGE}: ${age}`);
  }
}

function assertDays(days) {
  if (!Number.isInteger(days) || days < 0) {
    throw new BadRequestError(`Working days must be a non-negative integer: ${days}`);
  }
}

const applyPercentDiscount = (amount, percent) =>
  Math.round((amount * (PERCENT_BASE - percent)) / PERCENT_BASE);

/** Навчання за місяць зі знижкою 0 або одним із discountLevels */
function tuitionMonthly(discountPercent, tuition = 1500000, discountLevels = [10, 20, 30]) {
  assertDiscount(discountPercent, discountLevels);
  return applyPercentDiscount(tuition, discountPercent);
}

/** Харчування за день: basePerDay для 2-річних, +perExtraYear за кожен наступний рік */
function mealPerDay(age, basePerDay = 30000, perExtraYear = 10000) {
  assertAge(age);
  return basePerDay + perExtraYear * (age - MIN_AGE);
}

/** Харчування за місяць */
function mealMonthly(age, workingDays = 21, basePerDay = 30000, perExtraYear = 10000) {
  assertDays(workingDays);
  return mealPerDay(age, basePerDay, perExtraYear) * workingDays;
}

/** До оплати за місяць з навчанням і харчуванням */
function monthlyTotal(
  age,
  discountPercent,
  tuition = 1500000,
  discountLevels = [10, 20, 30],
  basePerDay = 30000,
  perExtraYear = 10000,
  workingDays = 21
) {
  return (
    tuitionMonthly(discountPercent, tuition, discountLevels) +
    mealMonthly(age, workingDays, basePerDay, perExtraYear)
  );
}

/** До оплати за рік: знижка yearlyDiscountPercent на навчання, на харчування не діє */
function yearlyTotal(
  age,
  discountPercent,
  tuition = 1500000,
  discountLevels = [10, 20, 30],
  yearlyDiscountPercent = 12,
  basePerDay = 30000,
  perExtraYear = 10000,
  workingDaysPerYear = 252
) {
  const yearlyTuition = applyPercentDiscount(
    tuitionMonthly(discountPercent, tuition, discountLevels) * MONTHS_PER_YEAR,
    yearlyDiscountPercent
  );
  const meals = mealPerDay(age, basePerDay, perExtraYear) * workingDaysPerYear;
  return yearlyTuition + meals;
}

module.exports = {
  tuitionMonthly,
  mealPerDay,
  mealMonthly,
  monthlyTotal,
  yearlyTotal,
  MIN_AGE,
  MAX_AGE,
};