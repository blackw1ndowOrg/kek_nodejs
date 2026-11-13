jest.mock('../../../src/domain/pricing', () => ({
  tuitionMonthly: jest.fn(),
  monthlyTotal: jest.fn(),
  yearlyTotal: jest.fn(),
  calculatePriceTag: jest.fn(),
}));

const {
  tuitionMonthly,
  monthlyTotal,
  yearlyTotal,
  calculatePriceTag,
} = require('../../../src/domain/pricing');
const {
  BillingService,
  billingService,
  CURRENCY,
} = require('../../../src/modules/billing/billing.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../src/errors/AppError');

const PARENT = { id: 9, role: 'PARENT' };
const OTHER_PARENT = { id: 10, role: 'PARENT' };
const ADMIN = { id: 1, role: 'ADMIN' };
const MANAGER = { id: 2, role: 'MANAGER' };

// 26.10.2026 15:30 UTC -> "сьогодні" = 2026-10-26T00:00:00Z
const NOW = new Date('2026-10-26T15:30:00Z');
const TODAY = new Date('2026-10-26T00:00:00Z');

const SETTINGS = Object.freeze({
  TUITION_MONTHLY: 300000,
  DISCOUNT_LEVELS: Object.freeze([0, 10, 20]),
  MEAL_BASE_PER_DAY: 5000,
  MEAL_PER_EXTRA_YEAR: 500,
  YEARLY_DISCOUNT_PERCENT: 10,
});

const TUITION = 270000;
const MONTHLY_TOTAL = 350000;
const YEARLY_TOTAL = 3780000;

const MOCK_PRICE_TAG = Object.freeze({
  groupAge: 3,
  tuition: {
    base: 300000,
    discountPercent: 10,
    discountAmount: 30000,
    discountUah: 300,
    yearlyDiscountPercent: 10,
    monthlyTuition: TUITION,
    yearlyTuition: 2916000,
    yearlyMonthlyEquivalent: 243000,
  },
  meals: {
    groupAge: 3,
    ratePerDay: 5500,
    workingDays: 21,
    absentDays: 0,
    billableDays: 21,
    total: 115500,
    yearlyWorkingDays: 252,
    yearlyTotal: 1386000,
  },
  monthly: {
    tuition: TUITION,
    meals: 115500,
    total: MONTHLY_TOTAL,
  },
  yearly: {
    tuition: 2916000,
    meals: 1386000,
    total: YEARLY_TOTAL,
  },
  plans: {
    monthly: { total: MONTHLY_TOTAL },
    yearly: { total: YEARLY_TOTAL },
    savings: { amount: 324000, percent: 10 },
  },
  savings: {
    amount: 324000,
    amountUah: 3240,
    percent: 10,
  },
});

const CHILD = Object.freeze({
  id: 5,
  fullName: 'Іван Петренко',
  discountPercent: 10,
  paymentPlan: 'MONTHLY',
  paidUntil: null,
  isActive: true,
  group: { age: 3 },
  parents: [{ parent: { userId: 9 } }],
});

function createService(child = CHILD, { updated = 1 } = {}) {
  const repository = {
    findChildWithParents: jest.fn().mockResolvedValue(child),
    findAbsences: jest.fn().mockResolvedValue([]),
    updatePaidUntil: jest.fn().mockResolvedValue(updated),
  };
  const settings = { get: jest.fn((key) => SETTINGS[key]) };
  const service = new BillingService(repository, settings);
  return { repository, settings, service };
}

const iso = (date) => date.toISOString().slice(0, 10);

beforeEach(() => {
  tuitionMonthly.mockReturnValue(TUITION);
  monthlyTotal.mockReturnValue(MONTHLY_TOTAL);
  yearlyTotal.mockReturnValue(YEARLY_TOTAL);
  calculatePriceTag.mockReturnValue(MOCK_PRICE_TAG);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('BillingService', () => {
  test('експортований екземпляр і валюта за замовчуванням', () => {
    expect(billingService).toBeInstanceOf(BillingService);
    expect(CURRENCY).toBe('UAH');
  });

  describe('loadAccessibleChild', () => {
    test('батько бачить свою дитину', async () => {
      const { repository, service } = createService();
      await expect(service.loadAccessibleChild(PARENT, 5)).resolves.toBe(CHILD);
      expect(repository.findChildWithParents).toHaveBeenCalledWith(5);
    });

    test('батько не бачить чужу дитину -> 404', async () => {
      const { service } = createService();
      await expect(service.loadAccessibleChild(OTHER_PARENT, 5)).rejects.toThrow(NotFoundError);
    });

    test('у дитини немає прив’язаних батьків -> 404 для батька', async () => {
      const { service } = createService({ ...CHILD, parents: [] });
      await expect(service.loadAccessibleChild(PARENT, 5)).rejects.toThrow(NotFoundError);
    });

    test.each([
      ['ADMIN', ADMIN],
      ['MANAGER', MANAGER],
    ])('%s бачить будь-яку дитину', async (_role, user) => {
      const { service } = createService();
      await expect(service.loadAccessibleChild(user, 5)).resolves.toBe(CHILD);
    });

    test.each([
      ['PARENT', PARENT],
      ['ADMIN', ADMIN],
    ])('дитини немає -> 404 (%s)', async (_role, user) => {
      const { service } = createService(null);
      await expect(service.loadAccessibleChild(user, 99)).rejects.toThrow(NotFoundError);
    });
  });

  describe('calculate', () => {
    test('дитина без групи -> 400', () => {
      const { service } = createService();
      expect(() => service.calculate({ ...CHILD, group: null })).toThrow(BadRequestError);
      expect(tuitionMonthly).not.toHaveBeenCalled();
    });

    test('рахує за віком групи, а не дитини; значення беруться з налаштувань', () => {
      const { settings, service } = createService();
      const bill = service.calculate(CHILD);

      expect(bill).toEqual({
        groupAge: 3,
        monthly: { tuition: TUITION, meals: MONTHLY_TOTAL - TUITION, total: MONTHLY_TOTAL },
        yearly: { total: YEARLY_TOTAL },
      });
      expect(settings.get).toHaveBeenCalledWith('TUITION_MONTHLY');
      expect(settings.get).toHaveBeenCalledWith('DISCOUNT_LEVELS');
      expect(settings.get).toHaveBeenCalledWith('MEAL_BASE_PER_DAY');
      expect(settings.get).toHaveBeenCalledWith('MEAL_PER_EXTRA_YEAR');
      expect(settings.get).toHaveBeenCalledWith('YEARLY_DISCOUNT_PERCENT');
      expect(tuitionMonthly).toHaveBeenCalledWith(10, 300000, SETTINGS.DISCOUNT_LEVELS);
      expect(monthlyTotal).toHaveBeenCalledWith(
        3,
        10,
        300000,
        SETTINGS.DISCOUNT_LEVELS,
        5000,
        500,
        21
      );
      expect(yearlyTotal).toHaveBeenCalledWith(
        3,
        10,
        300000,
        SETTINGS.DISCOUNT_LEVELS,
        10,
        5000,
        500
      );
    });
  });

  describe('amountFor', () => {
    const bill = { monthly: { total: 100 }, yearly: { total: 1000 } };

    test.each([
      ['MONTHLY', 100],
      ['YEARLY', 1000],
    ])('%s -> %i', (plan, amount) => {
      const { service } = createService();
      expect(service.amountFor(plan, bill)).toBe(amount);
    });
  });

  describe('getChildBilling', () => {
    test('повертає розрахунок і дату оплати', async () => {
      const { service } = createService({ ...CHILD, paidUntil: new Date('2026-11-10T00:00:00Z') });
      await expect(service.getChildBilling(PARENT, 5, NOW)).resolves.toEqual({
        childId: 5,
        fullName: 'Іван Петренко',
        groupAge: 3,
        discountPercent: 10,
        paymentPlan: 'MONTHLY',
        currency: 'UAH',
        monthly: {
          tuition: TUITION,
          meals: MONTHLY_TOTAL - TUITION,
          total: MONTHLY_TOTAL,
          month: '2026-10',
          mealDays: 21,
          absentDays: 0,
        },
        yearly: { total: YEARLY_TOTAL },
        amountDue: MONTHLY_TOTAL,
        paidUntil: '2026-11-10',
        isPaid: true,
      });
    });

    test('річний план: amountDue — річна сума', async () => {
      const { service } = createService({ ...CHILD, paymentPlan: 'YEARLY' });
      const result = await service.getChildBilling(ADMIN, 5, NOW);
      expect(result.amountDue).toBe(YEARLY_TOTAL);
    });

    test.each([
      ['ніколи не платили', null, false, null],
      ['оплачено до вчора', new Date('2026-10-25T00:00:00Z'), false, '2026-10-25'],
      ['оплачено до сьогодні включно', TODAY, true, '2026-10-26'],
      ['оплачено наперед', new Date('2027-01-01T00:00:00Z'), true, '2027-01-01'],
    ])('isPaid: %s', async (_name, paidUntil, isPaid, isoValue) => {
      const { service } = createService({ ...CHILD, paidUntil });
      const result = await service.getChildBilling(PARENT, 5, NOW);
      expect(result.isPaid).toBe(isPaid);
      expect(result.paidUntil).toBe(isoValue);
    });

    test('без аргументу now береться поточний час', async () => {
      jest.useFakeTimers().setSystemTime(NOW);
      const { service } = createService({ ...CHILD, paidUntil: TODAY });
      await expect(service.getChildBilling(PARENT, 5)).resolves.toMatchObject({ isPaid: true });
    });

    test('чужа дитина -> 404', async () => {
      const { service } = createService();
      await expect(service.getChildBilling(OTHER_PARENT, 5, NOW)).rejects.toThrow(NotFoundError);
    });

    test('дитина без групи -> 400', async () => {
      const { service } = createService({ ...CHILD, group: null });
      await expect(service.getChildBilling(PARENT, 5, NOW)).rejects.toThrow(BadRequestError);
    });

    describe('відсутності', () => {
      const absence = (date, notifiedAt) => ({
        date: new Date(`${date}T00:00:00Z`),
        notifiedAt: new Date(notifiedAt),
      });

      test('зараховані відсутності місяця зменшують дні харчування', async () => {
        const { repository, service } = createService();
        repository.findAbsences.mockResolvedValueOnce([
          absence('2026-10-14', '2026-10-13T18:00:00Z'),
          absence('2026-10-15', '2026-10-15T08:29:59+03:00'),
        ]);
        const result = await service.getChildBilling(PARENT, 5, NOW);
        expect(repository.findAbsences).toHaveBeenCalledWith(5, {
          from: new Date('2026-10-01T00:00:00Z'),
          to: new Date('2026-11-01T00:00:00Z'),
        });
        expect(monthlyTotal).toHaveBeenLastCalledWith(
          3,
          10,
          300000,
          SETTINGS.DISCOUNT_LEVELS,
          5000,
          500,
          19
        );
        expect(result.monthly).toMatchObject({ month: '2026-10', mealDays: 19, absentDays: 2 });
      });

      test('повідомили о 08:30 чи пізніше -> день не віднімається', async () => {
        const { repository, service } = createService();
        repository.findAbsences.mockResolvedValueOnce([
          absence('2026-10-15', '2026-10-15T08:30:00+03:00'),
        ]);
        const result = await service.getChildBilling(PARENT, 5, NOW);
        expect(result.monthly).toMatchObject({ mealDays: 21, absentDays: 0 });
      });

      test('конкретний місяць', async () => {
        const { repository, service } = createService();
        const result = await service.getChildBilling(ADMIN, 5, NOW, '2026-09');
        expect(repository.findAbsences).toHaveBeenCalledWith(5, {
          from: new Date('2026-09-01T00:00:00Z'),
          to: new Date('2026-10-01T00:00:00Z'),
        });
        expect(result.monthly.month).toBe('2026-09');
      });

      test('річна сума відсутностей не враховує', async () => {
        const { repository, service } = createService();
        repository.findAbsences.mockResolvedValueOnce([
          absence('2026-10-14', '2026-10-13T18:00:00Z'),
        ]);
        const result = await service.getChildBilling(PARENT, 5, NOW);
        expect(result.yearly).toEqual({ total: YEARLY_TOTAL });
        expect(yearlyTotal).toHaveBeenCalledWith(
          3,
          10,
          300000,
          SETTINGS.DISCOUNT_LEVELS,
          10,
          5000,
          500
        );
      });
    });
  });

  describe('payForChild', () => {
    test('перша оплата за місяць: відлік від сьогодні', async () => {
      const { repository, service } = createService();
      const result = await service.payForChild(PARENT, 5, 'MONTHLY', NOW);

      expect(result).toEqual({
        childId: 5,
        plan: 'MONTHLY',
        amount: MONTHLY_TOTAL,
        currency: 'UAH',
        paidUntil: '2026-11-26',
      });
      expect(repository.updatePaidUntil).toHaveBeenCalledWith(
        5,
        null,
        new Date('2026-11-26T00:00:00Z')
      );
    });

    test('оплата за рік: +12 місяців і річна сума', async () => {
      const { service } = createService();
      const result = await service.payForChild(PARENT, 5, 'YEARLY', NOW);
      expect(result).toMatchObject({
        plan: 'YEARLY',
        amount: YEARLY_TOTAL,
        paidUntil: '2027-10-26',
      });
    });

    test('plan не передано -> береться paymentPlan дитини', async () => {
      const { service } = createService({ ...CHILD, paymentPlan: 'YEARLY' });
      const result = await service.payForChild(PARENT, 5, undefined, NOW);
      expect(result.plan).toBe('YEARLY');
      expect(result.amount).toBe(YEARLY_TOTAL);
    });

    test('явний plan перекриває paymentPlan дитини', async () => {
      const { service } = createService({ ...CHILD, paymentPlan: 'YEARLY' });
      const result = await service.payForChild(PARENT, 5, 'MONTHLY', NOW);
      expect(result.plan).toBe('MONTHLY');
      expect(result.amount).toBe(MONTHLY_TOTAL);
    });

    test.each([
      ['оплата ще діє — продовжуємо від paidUntil', '2026-11-10T00:00:00Z', '2026-12-10'],
      ['оплата закінчується сьогодні — відлік від сьогодні', '2026-10-26T00:00:00Z', '2026-11-26'],
      ['оплата прострочена — відлік від сьогодні', '2026-09-01T00:00:00Z', '2026-11-26'],
    ])('%s', async (_name, paidUntil, expected) => {
      const { repository, service } = createService({ ...CHILD, paidUntil: new Date(paidUntil) });
      const result = await service.payForChild(PARENT, 5, 'MONTHLY', NOW);
      expect(result.paidUntil).toBe(expected);
      expect(repository.updatePaidUntil).toHaveBeenCalledWith(
        5,
        new Date(paidUntil),
        new Date(`${expected}T00:00:00Z`)
      );
    });

    test('31 січня + місяць -> 28 лютого', async () => {
      const { service } = createService();
      const result = await service.payForChild(
        PARENT,
        5,
        'MONTHLY',
        new Date('2026-01-31T12:00:00Z')
      );
      expect(result.paidUntil).toBe('2026-02-28');
    });

    test('без аргументу now береться поточний час', async () => {
      jest.useFakeTimers().setSystemTime(NOW);
      const { service } = createService();
      const result = await service.payForChild(PARENT, 5, 'MONTHLY');
      expect(iso(new Date(`${result.paidUntil}T00:00:00Z`))).toBe('2026-11-26');
    });

    test('конкурентна зміна (0 оновлених рядків) -> 409', async () => {
      const { service } = createService(CHILD, { updated: 0 });
      await expect(service.payForChild(PARENT, 5, 'MONTHLY', NOW)).rejects.toThrow(ConflictError);
    });

    test('неактивна дитина -> 400, оплата не записується', async () => {
      const { repository, service } = createService({ ...CHILD, isActive: false });
      await expect(service.payForChild(PARENT, 5, 'MONTHLY', NOW)).rejects.toThrow(BadRequestError);
      expect(repository.updatePaidUntil).not.toHaveBeenCalled();
    });

    test('дитина без групи -> 400, оплата не записується', async () => {
      const { repository, service } = createService({ ...CHILD, group: null });
      await expect(service.payForChild(PARENT, 5, 'MONTHLY', NOW)).rejects.toThrow(BadRequestError);
      expect(repository.updatePaidUntil).not.toHaveBeenCalled();
    });

    test('чужа дитина -> 404, оплата не записується', async () => {
      const { repository, service } = createService();
      await expect(service.payForChild(OTHER_PARENT, 5, 'MONTHLY', NOW)).rejects.toThrow(
        NotFoundError
      );
      expect(repository.updatePaidUntil).not.toHaveBeenCalled();
    });

    test.each([
      ['ADMIN', ADMIN],
      ['MANAGER', MANAGER],
    ])('%s може оплатити за будь-яку дитину', async (_r, user) => {
      const { service } = createService();
      await expect(service.payForChild(user, 5, 'MONTHLY', NOW)).resolves.toMatchObject({
        childId: 5,
      });
    });
  });

  describe('getPriceTag', () => {
    test('повертає розклад цінника: total збігається з amountDue для MONTHLY', async () => {
      const { service } = createService();
      const result = await service.getPriceTag(PARENT, 5, NOW, '2026-10');

      expect(result).toMatchObject({
        childId: 5,
        fullName: 'Іван Петренко',
        groupAge: 3,
        discountPercent: 10,
        paymentPlan: 'MONTHLY',
        currency: 'UAH',
        total: MONTHLY_TOTAL,
        amountDue: MONTHLY_TOTAL,
        paidUntil: null,
        isPaid: false,
        monthly: {
          month: '2026-10',
          total: MONTHLY_TOTAL,
        },
        yearly: {
          total: YEARLY_TOTAL,
        },
      });
      expect(result).not.toHaveProperty('hasDeputyRelatives');
      expect(calculatePriceTag).toHaveBeenCalledWith({
        groupAge: 3,
        discountPercent: 10,
        tuition: SETTINGS.TUITION_MONTHLY,
        discountLevels: SETTINGS.DISCOUNT_LEVELS,
        yearlyDiscountPercent: SETTINGS.YEARLY_DISCOUNT_PERCENT,
        basePerDay: SETTINGS.MEAL_BASE_PER_DAY,
        perExtraYear: SETTINGS.MEAL_PER_EXTRA_YEAR,
        workingDays: 21,
        absentDays: 0,
      });
    });

    test('для плану YEARLY total цінника збігається з річною сумою (yearly.total)', async () => {
      const { service } = createService({ ...CHILD, paymentPlan: 'YEARLY' });
      const result = await service.getPriceTag(PARENT, 5, NOW, '2026-10');

      expect(result.total).toBe(YEARLY_TOTAL);
      expect(result.amountDue).toBe(YEARLY_TOTAL);
    });

    test('дитина без групи -> 400 BadRequestError', async () => {
      const { service } = createService({ ...CHILD, group: null });
      await expect(service.getPriceTag(PARENT, 5, NOW, '2026-10')).rejects.toThrow(BadRequestError);
    });

    test('чужа дитина для PARENT -> 404 NotFoundError', async () => {
      const { service } = createService();
      await expect(service.getPriceTag(OTHER_PARENT, 5, NOW, '2026-10')).rejects.toThrow(
        NotFoundError
      );
    });

    test.each([
      ['ADMIN', ADMIN],
      ['MANAGER', MANAGER],
    ])('%s має доступ до цінника будь-якої дитини', async (_r, user) => {
      const { service } = createService();
      await expect(service.getPriceTag(user, 5, NOW, '2026-10')).resolves.toMatchObject({
        childId: 5,
      });
    });
  });
});
