const { BadRequestError, ConflictError, NotFoundError } = require('../../errors/AppError');
const {
  tuitionMonthly,
  monthlyTotal,
  yearlyTotal,
  calculatePriceTag,
} = require('../../domain/pricing');
const { settingsService } = require('../settings/settings.service');
const { billingRepository } = require('./billing.repository');
const { startOfUtcDay, addMonthsUtc, toIsoDate } = require('./billing.dates');
const {
  WORKING_DAYS_PER_MONTH,
  isCounted,
  localMonth,
  mealDays,
  monthRange,
} = require('../../domain/absence');

const CURRENCY = 'UAH'; // All amounts are stored in kopiykas
const MONTHS_BY_PLAN = Object.freeze({ MONTHLY: 1, YEARLY: 12 });

class BillingService {
  constructor(repository = billingRepository, settings = settingsService) {
    this.repository = repository;
    this.settings = settings;
  }

  /** Admin and Manager can access any child; a Parent can only access their own (returns "not found" for others) */
  async loadAccessibleChild(user, childId) {
    const child = await this.repository.findChildWithParents(childId);
    const isOwnChild = child?.parents.some((link) => link.parent.userId === user.id);
    if (!child || (user.role === 'PARENT' && !isOwnChild)) {
      throw new NotFoundError('Child not found');
    }
    return child;
  }

  /** Prices come from the settings cache; meals are charged by the age of the child's group, not the child's own age */
  /**
   * @param {object} child
   * @param {number} days днів харчування за місяць: 21 мінус зараховані відсутності.
   *   Річна сума їх не враховує: відсутності наперед невідомі
   */
  calculate(child, days = WORKING_DAYS_PER_MONTH) {
    if (!child.group) {
      throw new BadRequestError(
        'Child is not assigned to a group: meal price depends on the group age'
      );
    }
    const groupAge = child.group.age;
    const discount = child.discountPercent;
    const tuition = this.settings.get('TUITION_MONTHLY');
    const levels = this.settings.get('DISCOUNT_LEVELS');
    const basePerDay = this.settings.get('MEAL_BASE_PER_DAY');
    const perExtraYear = this.settings.get('MEAL_PER_EXTRA_YEAR');
    const yearlyDiscount = this.settings.get('YEARLY_DISCOUNT_PERCENT');

    const monthlyTuition = tuitionMonthly(discount, tuition, levels);
    const monthlyTotalAmount = monthlyTotal(
      groupAge,
      discount,
      tuition,
      levels,
      basePerDay,
      perExtraYear,
      days
    );
    return {
      groupAge,
      monthly: {
        tuition: monthlyTuition,
        meals: monthlyTotalAmount - monthlyTuition,
        total: monthlyTotalAmount,
      },
      yearly: {
        total: yearlyTotal(
          groupAge,
          discount,
          tuition,
          levels,
          yearlyDiscount,
          basePerDay,
          perExtraYear
        ),
      },
    };
  }

  amountFor(plan, bill) {
    return plan === 'YEARLY' ? bill.yearly.total : bill.monthly.total;
  }

  /** Зараховані відсутності дитини за місяць 'YYYY-MM' (повідомлені до 08:30 дня відсутності) */
  async countedAbsences(childId, month) {
    const absences = await this.repository.findAbsences(childId, monthRange(month));
    return absences.filter(isCounted).length;
  }

  /**
   * Calculates billing details and payment due date for a child.
   * Місячна сума — за місяць month (за замовчуванням поточний): харчування за 21 день мінус
   * зараховані відсутності
   */
  async getChildBilling(user, childId, now = new Date(), month = localMonth(now)) {
    const child = await this.loadAccessibleChild(user, childId);
    const absentDays = await this.countedAbsences(child.id, month);
    const days = mealDays(absentDays);
    const bill = this.calculate(child, days);
    const today = startOfUtcDay(now);

    return {
      childId: child.id,
      fullName: child.fullName,
      groupAge: bill.groupAge,
      discountPercent: child.discountPercent,
      paymentPlan: child.paymentPlan,
      currency: CURRENCY,
      monthly: { ...bill.monthly, month, mealDays: days, absentDays },
      yearly: bill.yearly,
      amountDue: this.amountFor(child.paymentPlan, bill),
      paidUntil: toIsoDate(child.paidUntil),
      isPaid: Boolean(child.paidUntil) && child.paidUntil >= today,
    };
  }

  /**
   * Розклад цінника (Price Tag) дитини:
   * розклад навчання, розклад харчування з відсутностями, два плани поруч та економія
   */
  async getPriceTag(user, childId, now = new Date(), month = localMonth(now)) {
    const child = await this.loadAccessibleChild(user, childId);
    if (!child.group) {
      throw new BadRequestError(
        'Child is not assigned to a group: meal price depends on the group age'
      );
    }
    const groupAge = child.group.age;
    const discount = child.discountPercent;
    const tuition = this.settings.get('TUITION_MONTHLY');
    const levels = this.settings.get('DISCOUNT_LEVELS');
    const basePerDay = this.settings.get('MEAL_BASE_PER_DAY');
    const perExtraYear = this.settings.get('MEAL_PER_EXTRA_YEAR');
    const yearlyDiscount = this.settings.get('YEARLY_DISCOUNT_PERCENT');

    const absentDays = await this.countedAbsences(child.id, month);

    const priceTag = calculatePriceTag({
      groupAge,
      discountPercent: discount,
      tuition,
      discountLevels: levels,
      yearlyDiscountPercent: yearlyDiscount,
      basePerDay,
      perExtraYear,
      workingDays: WORKING_DAYS_PER_MONTH,
      absentDays,
    });

    const today = startOfUtcDay(now);
    const total = this.amountFor(child.paymentPlan, priceTag);

    return {
      childId: child.id,
      fullName: child.fullName,
      groupAge,
      discountPercent: child.discountPercent,
      paymentPlan: child.paymentPlan,
      currency: CURRENCY,
      paidUntil: toIsoDate(child.paidUntil),
      isPaid: Boolean(child.paidUntil) && child.paidUntil >= today,
      total,
      amountDue: total,
      monthly: {
        ...priceTag.monthly,
        month,
        mealDays: priceTag.meals.billableDays,
        absentDays,
      },
      yearly: priceTag.yearly,
      tuition: priceTag.tuition,
      meals: {
        ...priceTag.meals,
        month,
      },
      plans: priceTag.plans,
      savings: priceTag.savings,
    };
  }

  /** Records a tuition payment: extends paidUntil by 1 month or 12 months */
  async payForChild(user, childId, plan, now = new Date()) {
    const child = await this.loadAccessibleChild(user, childId);
    if (!child.isActive) {
      throw new BadRequestError('Child is not active');
    }

    const chosenPlan = plan ?? child.paymentPlan;
    const amount = this.amountFor(chosenPlan, this.calculate(child));

    const today = startOfUtcDay(now);
    const base = child.paidUntil && child.paidUntil > today ? child.paidUntil : today;
    const paidUntil = addMonthsUtc(base, MONTHS_BY_PLAN[chosenPlan]);

    const updated = await this.repository.updatePaidUntil(child.id, child.paidUntil, paidUntil);
    if (updated === 0) {
      throw new ConflictError('Payment status was changed by another request, please retry');
    }

    return {
      childId: child.id,
      plan: chosenPlan,
      amount,
      currency: CURRENCY,
      paidUntil: toIsoDate(paidUntil),
    };
  }
}

const billingService = new BillingService();

module.exports = { BillingService, billingService, CURRENCY };
