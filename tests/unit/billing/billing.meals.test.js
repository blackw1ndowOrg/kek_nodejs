const { BillingService } = require('../../../src/modules/billing/billing.service');

// Справжні формули цін (без моків domain/pricing): харчування за місяць = ставка × дні,
// де дні = 21 мінус зараховані відсутності. Ставки — за замовчуванням із налаштувань.

const SETTINGS = Object.freeze({
  TUITION_MONTHLY: 1500000,
  DISCOUNT_LEVELS: Object.freeze([10, 20, 30]),
  MEAL_BASE_PER_DAY: 30000,
  MEAL_PER_EXTRA_YEAR: 10000,
  YEARLY_DISCOUNT_PERCENT: 12,
});

const PARENT = { id: 9, role: 'PARENT' };
const NOW = new Date('2026-10-26T10:00:00+02:00');

// Група 3-річних: ставка 300 + 100 = 400 грн/день
const CHILD = Object.freeze({
  id: 5,
  fullName: 'Іван Петренко',
  discountPercent: 0,
  paymentPlan: 'MONTHLY',
  paidUntil: null,
  isActive: true,
  group: { age: 3 },
  parents: [{ parent: { userId: 9 } }],
});

const absence = (date, notifiedAt) => ({
  date: new Date(`${date}T00:00:00Z`),
  notifiedAt: new Date(notifiedAt),
});

function billingWith(absences) {
  const repository = {
    findChildWithParents: jest.fn().mockResolvedValue(CHILD),
    findAbsences: jest.fn().mockResolvedValue(absences),
  };
  const settings = { get: (key) => SETTINGS[key] };
  return new BillingService(repository, settings).getChildBilling(PARENT, 5, NOW, '2026-10');
}

describe('Billing: харчування з урахуванням відсутностей (справжні формули)', () => {
  test('без відсутностей сума як раніше: 3 роки — 8 400 грн за 21 день', async () => {
    const { monthly } = await billingWith([]);
    expect(monthly).toEqual({
      tuition: 1500000,
      meals: 840000,
      total: 2340000,
      month: '2026-10',
      mealDays: 21,
      absentDays: 0,
    });
  });

  test('дві зараховані відсутності за жовтень: харчування = ставка × 19 днів', async () => {
    const { monthly, amountDue } = await billingWith([
      absence('2026-10-14', '2026-10-13T19:00:00+03:00'),
      absence('2026-10-20', '2026-10-20T08:29:59+03:00'),
    ]);
    expect(monthly.meals).toBe(40000 * 19);
    expect(monthly).toMatchObject({ mealDays: 19, absentDays: 2, total: 1500000 + 760000 });
    expect(amountDue).toBe(1500000 + 760000);
  });

  test('повідомили о 08:30 -> день оплачується', async () => {
    const { monthly } = await billingWith([absence('2026-10-20', '2026-10-20T08:30:00+03:00')]);
    expect(monthly).toMatchObject({ meals: 840000, mealDays: 21, absentDays: 0 });
  });

  test('навчання не змінюється, річна сума не враховує відсутностей', async () => {
    const without = await billingWith([]);
    const withAbsences = await billingWith([absence('2026-10-14', '2026-10-13T19:00:00+03:00')]);
    expect(withAbsences.monthly.tuition).toBe(without.monthly.tuition);
    expect(withAbsences.yearly).toEqual(without.yearly);
  });
});
