const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { billingRepository } = require('../../src/modules/billing/billing.repository');
const { analyticsRepository } = require('../../src/modules/analytics/analytics.repository');
const { settingsService } = require('../../src/modules/settings/settings.service');

describe('Discount Retention Integration Scenarios (Billing & Analytics)', () => {
  const app = createApp();

  const tokenFor = (role, id = 1) =>
    `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /billing/children/:id -> 200 та 10 500 грн за навчання для дитини зі збереженими 30% знижки після зміни discountLevels на [10, 20]', async () => {
    // Емулюємо зміну налаштування discountLevels на [10, 20]
    jest.spyOn(settingsService, 'get').mockImplementation((key) => {
      if (key === 'DISCOUNT_LEVELS') return [10, 20];
      if (key === 'TUITION_MONTHLY') return 1500000; // 15 000 грн
      if (key === 'MEAL_BASE_PER_DAY') return 30000;
      if (key === 'MEAL_PER_EXTRA_YEAR') return 10000;
      if (key === 'YEARLY_DISCOUNT_PERCENT') return 12;
      return null;
    });

    // Дитина вже має призначену пільгу 30%
    jest.spyOn(billingRepository, 'findChildWithParents').mockResolvedValueOnce({
      id: 7,
      fullName: 'Олексій Шевченко',
      discountPercent: 30,
      paymentPlan: 'MONTHLY',
      paidUntil: null,
      isActive: true,
      group: { id: 1, age: 4 },
      parents: [{ parent: { userId: 10 } }],
    });

    const res = await request(app)
      .get('/api/v1/billing/children/7')
      .set('Authorization', tokenFor('ADMIN'));

    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body.childId).toBe(7);
    expect(res.body.discountPercent).toBe(30);
    // Навчання за місяць: 15 000 * 0.7 = 10 500 грн = 1 050 000 копійок
    expect(res.body.monthly.tuition).toBe(1050000);
    // Харчування 4 роки (21 день): (300 + 100 * 2) * 21 = 500 * 21 = 10 500 грн = 1 050 000 коп
    expect(res.body.monthly.meals).toBe(1050000);
    // Разом: 10 500 + 10 500 = 21 000 грн = 2 100 000 коп
    expect(res.body.monthly.total).toBe(2100000);
  });

  test('GET /analytics/groups/:id/profit -> 200 для групи з дитиною, що має 30% знижки при DISCOUNT_LEVELS [10, 20]', async () => {
    jest.spyOn(settingsService, 'get').mockImplementation((key) => {
      if (key === 'DISCOUNT_LEVELS') return [10, 20];
      if (key === 'TUITION_MONTHLY') return 1500000;
      if (key === 'MEAL_BASE_PER_DAY') return 30000;
      if (key === 'MEAL_PER_EXTRA_YEAR') return 10000;
      if (key === 'YEARLY_DISCOUNT_PERCENT') return 12;
      if (key === 'EDUCATOR_PER_CHILD') return 200000;
      if (key === 'EDUCATOR_EXTRA_PAY') return 300000;
      if (key === 'ASSISTANT_SALARY') return 2000000;
      if (key === 'ASSISTANT_EXTRA_PAY') return 300000;
      if (key === 'GROUP_EXTRA_PAY_THRESHOLD') return 12;
      if (key === 'ROOM_MONTHLY_COST') return 5000000;
      return null;
    });

    jest.spyOn(analyticsRepository, 'findGroupById').mockResolvedValueOnce({
      id: 1,
      name: 'Калинка',
      age: 4,
      room: { id: 1, name: 'Кімната 1', monthlyCost: 5000000 },
      children: [{ id: 7, discountPercent: 30, paymentPlan: 'MONTHLY' }],
      educator: { id: 1, isActive: true },
      assistant: { id: 2, isActive: true },
      educatorId: 1,
      assistantId: 2,
    });

    const res = await request(app)
      .get('/api/v1/analytics/groups/1/profit')
      .set('Authorization', tokenFor('ADMIN'));

    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body.groupId).toBe(1);
    expect(res.body.income.tuition.kopiykas).toBe(1050000);
    expect(res.body.income.tuition.uah).toBe(10500);
  });

  test('GET /analytics/profit -> 200 для загального профіту при збереженій знижці 30% та DISCOUNT_LEVELS [10, 20]', async () => {
    jest.spyOn(settingsService, 'get').mockImplementation((key) => {
      if (key === 'DISCOUNT_LEVELS') return [10, 20];
      if (key === 'TUITION_MONTHLY') return 1500000;
      if (key === 'MEAL_BASE_PER_DAY') return 30000;
      if (key === 'MEAL_PER_EXTRA_YEAR') return 10000;
      if (key === 'YEARLY_DISCOUNT_PERCENT') return 12;
      if (key === 'EDUCATOR_PER_CHILD') return 200000;
      if (key === 'EDUCATOR_EXTRA_PAY') return 300000;
      if (key === 'ASSISTANT_SALARY') return 2000000;
      if (key === 'ASSISTANT_EXTRA_PAY') return 300000;
      if (key === 'GROUP_EXTRA_PAY_THRESHOLD') return 12;
      if (key === 'CLUB_TEACHER_SALARY') return 4000000;
      if (key === 'MANAGER_SALARY') return 8000000;
      if (key === 'ROOM_MONTHLY_COST') return 5000000;
      if (key === 'DEFAULT_ROOMS_COUNT') return 20;
      return null;
    });

    jest.spyOn(analyticsRepository, 'findAllGroupsWithActiveChildren').mockResolvedValueOnce([
      {
        id: 1,
        name: 'Калинка',
        age: 4,
        room: { id: 1, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 7, discountPercent: 30, paymentPlan: 'MONTHLY' }],
        educator: { id: 1, isActive: true },
        assistant: { id: 2, isActive: true },
        educatorId: 1,
        assistantId: 2,
      },
    ]);
    jest.spyOn(analyticsRepository, 'countActiveStaffByType').mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/analytics/profit')
      .set('Authorization', tokenFor('ADMIN'));

    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body.income.tuition.kopiykas).toBe(1050000);
    expect(res.body.income.tuition.uah).toBe(10500);
  });
});
