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

function assertDiscount(discountPercent) {
  if (
    typeof discountPercent !== 'number' ||
    !Number.isInteger(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    throw new BadRequestError(`Discount must be an integer from 0 to 100: ${discountPercent}`);
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

/** Навчання за місяць зі збереженою знижкою дитини (0..100) */
function tuitionMonthly(discountPercent, tuition = 1500000, _discountLevels) {
  assertDiscount(discountPercent);
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

/**
 * Розраховує місячну вартість навчання для конкретної дитини з урахуванням
 * її персональної пільги (discountPercent) та плану оплати (MONTHLY / YEARLY).
 * При річній оплаті (YEARLY) додатково мультиплікативно застосовується
 * знижка yearlyDiscountPercent (за замовчуванням 12%).
 */
function calculateChildMonthlyTuition(
  discountOrChild,
  paymentPlan = 'MONTHLY',
  tuition = 1500000,
  discountLevels = [10, 20, 30],
  yearlyDiscountPercent = 12
) {
  let discountPercent = discountOrChild;
  let plan = paymentPlan;
  let actualTuition = tuition;
  let actualDiscountLevels = discountLevels;
  let actualYearlyDiscountPercent = yearlyDiscountPercent;

  if (typeof discountOrChild === 'object' && discountOrChild !== null) {
    discountPercent = discountOrChild.discountPercent ?? 0;
    plan = discountOrChild.paymentPlan ?? 'MONTHLY';

    if (typeof paymentPlan === 'number') {
      actualTuition = paymentPlan;
      actualDiscountLevels = Array.isArray(tuition) ? tuition : [10, 20, 30];
      actualYearlyDiscountPercent = typeof discountLevels === 'number' ? discountLevels : 12;
    }
  }

  const baseMonthly = tuitionMonthly(discountPercent, actualTuition, actualDiscountLevels);
  if (plan === 'YEARLY') {
    return applyPercentDiscount(baseMonthly, actualYearlyDiscountPercent);
  }
  return baseMonthly;
}

/**
 * Розрахунок детального цінника (Price Tag) для батьків:
 * - навчання: базова ціна, пільга (відсоток і сума), річна знижка, підсумок
 * - харчування: ставка за день за віком групи, дні, мінус дні відсутності, підсумок
 * - порівняння двох планів (місяць і рік) поруч з економією
 * Всі суми розраховуються в копійках.
 */
function calculatePriceTag({
  groupAge,
  discountPercent = 0,
  tuition = 1500000,
  discountLevels = [10, 20, 30],
  yearlyDiscountPercent = 12,
  basePerDay = 30000,
  perExtraYear = 10000,
  workingDays = 21,
  absentDays = 0,
  workingDaysPerYear = 252,
}) {
  assertAge(groupAge);
  assertDiscount(discountPercent, discountLevels);
  assertDays(workingDays);
  assertDays(absentDays);
  assertDays(workingDaysPerYear);

  const billableMealDays = Math.max(0, workingDays - absentDays);

  // 1. Навчання
  const baseMonthlyTuition = tuition;
  const monthlyTuitionAmount = tuitionMonthly(discountPercent, tuition, discountLevels);
  const tuitionDiscountAmount = baseMonthlyTuition - monthlyTuitionAmount;
  const tuitionDiscountUah = Number((tuitionDiscountAmount / 100).toFixed(2));

  // Річне навчання: 12 місяців зі знижкою yearlyDiscountPercent
  const yearlyTuitionAmount = applyPercentDiscount(
    monthlyTuitionAmount * MONTHS_PER_YEAR,
    yearlyDiscountPercent
  );
  const yearlyMonthlyEquivalent = calculateChildMonthlyTuition(
    discountPercent,
    'YEARLY',
    tuition,
    discountLevels,
    yearlyDiscountPercent
  );

  // 2. Харчування (не знижується ні пільгою, ні річною знижкою)
  const ratePerDay = mealPerDay(groupAge, basePerDay, perExtraYear);
  const monthlyMealsTotal = ratePerDay * billableMealDays;
  const yearlyMealsTotal = ratePerDay * workingDaysPerYear;

  // 3. Плани
  const monthlyPlan = {
    tuition: monthlyTuitionAmount,
    meals: monthlyMealsTotal,
    total: monthlyTuitionAmount + monthlyMealsTotal,
  };

  const yearlyPlan = {
    tuition: yearlyTuitionAmount,
    meals: yearlyMealsTotal,
    total: yearlyTuitionAmount + yearlyMealsTotal,
  };

  // Економія за рік (12 місяців за базовим помісячним розрахунком проти річного плану)
  const fullYearMonthlyTotal = monthlyTuitionAmount * MONTHS_PER_YEAR + yearlyMealsTotal;
  const savingsAmount = Math.max(0, fullYearMonthlyTotal - yearlyPlan.total);
  const savingsUah = Number((savingsAmount / 100).toFixed(2));

  return {
    groupAge,
    tuition: {
      base: baseMonthlyTuition,
      discountPercent,
      discountAmount: tuitionDiscountAmount,
      discountUah: tuitionDiscountUah,
      yearlyDiscountPercent,
      monthlyTuition: monthlyTuitionAmount,
      yearlyTuition: yearlyTuitionAmount,
      yearlyMonthlyEquivalent,
    },
    meals: {
      groupAge,
      ratePerDay,
      workingDays,
      absentDays,
      billableDays: billableMealDays,
      total: monthlyMealsTotal,
      yearlyWorkingDays: workingDaysPerYear,
      yearlyTotal: yearlyMealsTotal,
    },
    monthly: monthlyPlan,
    yearly: yearlyPlan,
    plans: {
      monthly: {
        tuition: {
          base: baseMonthlyTuition,
          discountPercent,
          discountAmount: tuitionDiscountAmount,
          discountUah: tuitionDiscountUah,
          total: monthlyTuitionAmount,
        },
        meals: {
          groupAge,
          ratePerDay,
          workingDays,
          absentDays,
          billableDays: billableMealDays,
          total: monthlyMealsTotal,
        },
        total: monthlyPlan.total,
      },
      yearly: {
        tuition: {
          base: baseMonthlyTuition * MONTHS_PER_YEAR,
          baseMonthly: baseMonthlyTuition,
          discountPercent,
          yearlyDiscountPercent,
          monthlyEquivalent: yearlyMonthlyEquivalent,
          total: yearlyTuitionAmount,
        },
        meals: {
          groupAge,
          ratePerDay,
          workingDays: workingDaysPerYear,
          absentDays: 0,
          billableDays: workingDaysPerYear,
          total: yearlyMealsTotal,
        },
        total: yearlyPlan.total,
      },
      savings: {
        amount: savingsAmount,
        amountUah: savingsUah,
        percent: yearlyDiscountPercent,
        description: `Економія ${yearlyDiscountPercent}% на оплаті навчання за рік`,
      },
    },
    savings: {
      amount: savingsAmount,
      amountUah: savingsUah,
      percent: yearlyDiscountPercent,
    },
  };
}

module.exports = {
  applyPercentDiscount,
  calculateChildMonthlyTuition,
  calculatePriceTag,
  tuitionMonthly,
  mealPerDay,
  mealMonthly,
  monthlyTotal,
  yearlyTotal,
  MIN_AGE,
  MAX_AGE,
  NO_DISCOUNT,
};
