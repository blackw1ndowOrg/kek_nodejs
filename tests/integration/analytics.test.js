const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { analyticsRepository } = require('../../src/modules/analytics/analytics.repository');

const BASE = '/api/v1/analytics';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const MOCK_GROUP = {
  id: 2,
  name: 'Сонечко',
  age: 3,
  roomId: 6,
  room: { id: 6, name: 'Кімната Сонечко', monthlyCost: 5000000 },
  children: [
    { id: 1, fullName: 'Марія', discountPercent: 0 },
    { id: 2, fullName: 'Тарас', discountPercent: 10 },
  ],
};

const MOCK_ACTIVE_CHILDREN = [
  { id: 1, fullName: 'Марія', discountPercent: 0, groupId: 2 },
  { id: 2, fullName: 'Тарас', discountPercent: 10, groupId: 2 },
];

describe('Analytics API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(analyticsRepository, 'findGroupById').mockResolvedValue(MOCK_GROUP);
    jest.spyOn(analyticsRepository, 'findAllActiveChildren').mockResolvedValue(MOCK_ACTIVE_CHILDREN);
    jest.spyOn(analyticsRepository, 'findAllGroupsWithActiveChildren').mockResolvedValue([
      {
        id: 2,
        name: 'Сонечко',
        roomId: 6,
        room: { id: 6, monthlyCost: 5000000 },
        children: MOCK_ACTIVE_CHILDREN,
        _count: { children: 2 },
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Доступ та авторизація (RBAC)', () => {
    test('без токена -> 401 UNAUTHORIZED', async () => {
      const res1 = await request(app).get(`${BASE}/groups/2/profit`);
      expect(res1.status).toBe(StatusCodes.UNAUTHORIZED);

      const res2 = await request(app).get(`${BASE}/profit`);
      expect(res2.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test.each(['PARENT', 'TEACHER'])(
      '%s не має доступу до аналітики -> 403 FORBIDDEN',
      async (role) => {
        const resGroup = await request(app)
          .get(`${BASE}/groups/2/profit`)
          .set('Authorization', tokenFor(role));
        expect(resGroup.status).toBe(StatusCodes.FORBIDDEN);

        const resTotal = await request(app)
          .get(`${BASE}/profit`)
          .set('Authorization', tokenFor(role));
        expect(resTotal.status).toBe(StatusCodes.FORBIDDEN);
      }
    );

    test.each(['ADMIN', 'MANAGER'])(
      '%s має повний доступ до аналітики -> 200 OK',
      async (role) => {
        const resGroup = await request(app)
          .get(`${BASE}/groups/2/profit`)
          .set('Authorization', tokenFor(role));
        expect(resGroup.status).toBe(StatusCodes.OK);

        const resTotal = await request(app)
          .get(`${BASE}/profit`)
          .set('Authorization', tokenFor(role));
        expect(resTotal.status).toBe(StatusCodes.OK);
      }
    );
  });

  describe('GET /api/v1/analytics/groups/:id/profit', () => {
    test('успішний розрахунок профіту групи: 200 OK з розбивкою у гривнях та копійках', async () => {
      const res = await request(app)
        .get(`${BASE}/groups/2/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.groupId).toBe(2);
      expect(res.body.groupName).toBe('Сонечко');
      expect(res.body.childrenCount).toBe(2);

      // Дохід: дитина 1 (15 000 грн) + дитина 2 (13 500 грн) = 28 500 грн (2 850 000 коп)
      expect(res.body.income.tuition.uah).toBe(28500);
      expect(res.body.income.tuition.kopiykas).toBe(2850000);
      expect(res.body.income.total.uah).toBe(28500);

      // Витрати:
      // Вихователь (2 дітей): 2 * 2 000 = 4 000 грн (400 000 коп)
      expect(res.body.expenses.educatorSalary.uah).toBe(4000);
      expect(res.body.expenses.educatorSalary.kopiykas).toBe(400000);
      // Помічник (2 дітей): 20 000 грн (2 000 000 коп)
      expect(res.body.expenses.assistantSalary.uah).toBe(20000);
      expect(res.body.expenses.assistantSalary.kopiykas).toBe(2000000);
      // Оренда кімнати: 50 000 грн (5 000 000 коп)
      expect(res.body.expenses.roomRent.uah).toBe(50000);
      expect(res.body.expenses.roomRent.kopiykas).toBe(5000000);
      // Загальні витрати: 4 000 + 20 000 + 50 000 = 74 000 грн (7 400 000 коп)
      expect(res.body.expenses.total.uah).toBe(74000);
      expect(res.body.expenses.total.kopiykas).toBe(7400000);

      // Профіт: 28 500 - 74 000 = -45 500 грн (-4 550 000 коп)
      expect(res.body.profit.uah).toBe(-45500);
      expect(res.body.profit.kopiykas).toBe(-4550000);
      expect(res.body.profit.hryvnias).toBe(-45500);
      expect(res.body.profit.kopecks).toBe(-4550000);
    });

    test('групу не знайдено -> 404 NOT_FOUND', async () => {
      analyticsRepository.findGroupById.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`${BASE}/groups/999/profit`)
        .set('Authorization', tokenFor('MANAGER'));

      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    });

    test('невалідний ID групи (рядок) -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get(`${BASE}/groups/invalid-id/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /api/v1/analytics/profit', () => {
    test('успішний розрахунок загального профіту садка: 200 OK з розбивкою статей', async () => {
      const res = await request(app)
        .get(`${BASE}/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.activeChildrenCount).toBe(2);
      expect(res.body.groupsCount).toBe(1);
      expect(res.body.roomsCount).toBe(20);
      expect(res.body.clubTeachersCount).toBe(5);
      expect(res.body.managersCount).toBe(1);

      // Дохід від 2 дітей: 28 500 грн (2 850 000 коп)
      expect(res.body.income.tuition.uah).toBe(28500);
      expect(res.body.income.tuition.kopiykas).toBe(2850000);

      // Витрати:
      // Вихователі (1 група з 2 дітьми): 4 000 грн (400 000 коп)
      expect(res.body.expenses.educatorsSalary.uah).toBe(4000);
      // Помічники (1 група з 2 дітьми): 20 000 грн (2 000 000 коп)
      expect(res.body.expenses.assistantsSalary.uah).toBe(20000);
      // 5 викладачів гуртків: 200 000 грн (20 000 000 коп)
      expect(res.body.expenses.clubTeachersSalary.uah).toBe(200000);
      // 1 менеджер: 80 000 грн (8 000 000 коп)
      expect(res.body.expenses.managerSalary.uah).toBe(80000);
      // Разом персонал: 4 000 + 20 000 + 200 000 + 80 000 = 304 000 грн (30 400 000 коп)
      expect(res.body.expenses.staffSalaries.uah).toBe(304000);
      // Оренда 20 кімнат: 1 000 000 грн (100 000 000 коп)
      expect(res.body.expenses.roomsRent.uah).toBe(1000000);
      // Загальні витрати: 304 000 + 1 000 000 = 1 304 000 грн (130 400 000 коп)
      expect(res.body.expenses.total.uah).toBe(1304000);

      // Чистий профіт: 28 500 - 1 304 000 = -1 275 500 грн (-127 550 000 коп)
      expect(res.body.profit.uah).toBe(-1275500);
      expect(res.body.profit.kopiykas).toBe(-127550000);
      expect(res.body.netProfit.uah).toBe(-1275500);
    });
  });
});
