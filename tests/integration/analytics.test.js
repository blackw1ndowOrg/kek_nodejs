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
    jest
      .spyOn(analyticsRepository, 'findAllActiveChildren')
      .mockResolvedValue(MOCK_ACTIVE_CHILDREN);
    jest.spyOn(analyticsRepository, 'findAllGroupsWithActiveChildren').mockResolvedValue([
      {
        id: 2,
        name: 'Сонечко',
        age: 3,
        roomId: 6,
        room: { id: 6, monthlyCost: 5000000 },
        children: MOCK_ACTIVE_CHILDREN,
        _count: { children: 2 },
      },
    ]);
    jest.spyOn(analyticsRepository, 'countActiveStaffByType').mockResolvedValue({
      CLUB_TEACHER: 5,
      MANAGER: 1,
      EDUCATOR: 1,
      ASSISTANT: 1,
    });
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

      const res3 = await request(app).post(`${BASE}/forecast`).send({ targetChildrenCount: 150 });
      expect(res3.status).toBe(StatusCodes.UNAUTHORIZED);
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

        const resForecast = await request(app)
          .post(`${BASE}/forecast`)
          .set('Authorization', tokenFor(role))
          .send({ targetChildrenCount: 150 });
        expect(resForecast.status).toBe(StatusCodes.FORBIDDEN);
      }
    );

    test.each(['ADMIN', 'MANAGER'])('%s має повний доступ до аналітики -> 200 OK', async (role) => {
      const resGroup = await request(app)
        .get(`${BASE}/groups/2/profit`)
        .set('Authorization', tokenFor(role));
      expect(resGroup.status).toBe(StatusCodes.OK);

      const resTotal = await request(app)
        .get(`${BASE}/profit`)
        .set('Authorization', tokenFor(role));
      expect(resTotal.status).toBe(StatusCodes.OK);

      const resForecast = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor(role))
        .send({ targetChildrenCount: 150 });
      expect(resForecast.status).toBe(StatusCodes.OK);
    });
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

      // Дохід: дитина 1 (15 000 грн) + дитина 2 (13 500 грн) = 28 500 грн навчання
      // Харчування 3-річок (дефолтна відвідуваність 80%): 2 дітей * (400 грн * 21 день * 0.8) = 13 440 грн
      // Сумарний дохід: 28 500 + 13 440 = 41 940 грн (4 194 000 коп)
      expect(res.body.income.tuition.uah).toBe(28500);
      expect(res.body.income.tuition.kopiykas).toBe(2850000);
      expect(res.body.income.meal.uah).toBe(13440);
      expect(res.body.income.meal.kopiykas).toBe(1344000);
      expect(res.body.income.total.uah).toBe(41940);
      expect(res.body.income.total.kopiykas).toBe(4194000);

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

      // Профіт: 41 940 - 74 000 = -32 060 грн (-3 206 000 коп)
      expect(res.body.profit.uah).toBe(-32060);
      expect(res.body.profit.kopiykas).toBe(-3206000);
    });

    test('розрахунок профіту групи з кастомним attendanceRate=1 в query', async () => {
      const res = await request(app)
        .get(`${BASE}/groups/2/profit?attendanceRate=1`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.income.meal.uah).toBe(16800);
      expect(res.body.income.total.uah).toBe(45300);
      expect(res.body.profit.uah).toBe(-28700);
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

    test('невалідний attendanceRate в query -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get(`${BASE}/groups/2/profit?attendanceRate=1.5`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /api/v1/analytics/profit', () => {
    test('успішний розрахунок загального профіту садка: 200 OK з розбивкою статей', async () => {
      const res = await request(app).get(`${BASE}/profit`).set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.activeChildrenCount).toBe(2);
      expect(res.body.groupsCount).toBe(1);
      expect(res.body.roomsCount).toBe(20);
      expect(res.body.educatorsCount).toBe(1);
      expect(res.body.assistantsCount).toBe(1);
      expect(res.body.clubTeachersCount).toBe(5);
      expect(res.body.managersCount).toBe(1);

      // Дохід від 2 дітей: 28 500 грн навчання + 13 440 грн харчування (80% відвідуваності за замовчуванням) = 41 940 грн
      expect(res.body.income.tuition.uah).toBe(28500);
      expect(res.body.income.tuition.kopiykas).toBe(2850000);
      expect(res.body.income.meal.uah).toBe(13440);
      expect(res.body.income.meal.kopiykas).toBe(1344000);
      expect(res.body.income.total.uah).toBe(41940);
      expect(res.body.income.total.kopiykas).toBe(4194000);

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
      expect(res.body.expenses.operatingRoomsRent.uah).toBe(300000); // 1 групова + 5 гурткових = 6 кімнат
      expect(res.body.expenses.idleRoomsRent.uah).toBe(700000); // 14 кімнат простою
      // Загальні витрати: 304 000 + 1 000 000 = 1 304 000 грн (130 400 000 коп)
      expect(res.body.expenses.total.uah).toBe(1304000);

      // Чистий профіт: 41 940 - 1 304 000 = -1 262 060 грн (-126 206 000 коп)
      expect(res.body.profit.uah).toBe(-1262060);
      expect(res.body.profit.kopiykas).toBe(-126206000);
      expect(res.body.netProfit.uah).toBe(-1262060);
      // unassignedChildren не повертається
      expect(res.body.unassignedChildren).toBeUndefined();
      // Перевірка розмежування кімнат
      expect(res.body.rooms.total).toBe(20);
      expect(res.body.rooms.occupied).toBe(6);
      expect(res.body.rooms.vacant).toBe(14);
    });

    test('розрахунок загального профіту з кастомним attendanceRate=1 в query', async () => {
      const res = await request(app)
        .get(`${BASE}/profit?attendanceRate=1`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.income.meal.uah).toBe(16800);
      expect(res.body.income.total.uah).toBe(45300);
      expect(res.body.profit.uah).toBe(-1258700);
    });

    test('невалідний attendanceRate в query для загального профіту -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get(`${BASE}/profit?attendanceRate=-0.5`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('враховує додаткових помічників у штаті, нараховуючи їм базову зарплату', async () => {
      analyticsRepository.countActiveStaffByType.mockResolvedValueOnce({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 3, // 1 група -> 2 вільних помічники по 20 000 грн = +40 000 грн
      });

      const res = await request(app)
        .get(`${BASE}/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.assistantsCount).toBe(3);
      // 20 000 (1-ша група) + 40 000 (2 вільні) = 60 000 грн
      expect(res.body.expenses.assistantsSalary.uah).toBe(60000);
    });
  });

  describe('POST /api/v1/analytics/forecast', () => {
    test('успішне прогнозування для targetChildrenCount = 150: 200 OK з 3 секціями', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 150 });

      expect(res.status).toBe(StatusCodes.OK);

      // Секція 1: recommended (Абсолютний фінансовий оптимум)
      expect(res.body.recommended).toBeDefined();
      expect(res.body.recommended.totalAdmitted).toBe(150);
      expect(res.body.recommended.groupsCount).toBeGreaterThanOrEqual(8);
      expect(res.body.recommended.roomsOccupied).toBe(
        res.body.recommended.groupRoomsOccupied + res.body.recommended.clubRoomsOccupied
      );
      expect(res.body.recommended.clubTeachersCount).toBe(5);
      expect(res.body.recommended.netProfit.uah).toBeDefined();
      expect(res.body.recommended.netProfit.kopiykas).toBeDefined();
      expect(res.body.recommended.summary).toContain('Відкрити');

      // Секція 2: strategies (MAX_PROFIT, COMFORT_QUALITY, MINIMAL_INFRASTRUCTURE)
      expect(res.body.strategies).toBeDefined();
      expect(res.body.strategies.maxProfit.strategyCode).toBe('MAX_PROFIT');
      expect(res.body.strategies.comfortQuality.strategyCode).toBe('COMFORT_QUALITY');
      expect(res.body.strategies.minimalInfrastructure.strategyCode).toBe('MINIMAL_INFRASTRUCTURE');
      expect(res.body.strategies.minimalInfrastructure.groupsCount).toBe(8);
      expect(res.body.strategies.minimalInfrastructure.totalAdmitted).toBe(150);

      // Секція 3: marginalEconomics (marginalChild, clubTeachersStatus, expansionAnalysis)
      expect(res.body.marginalEconomics).toBeDefined();
      expect(res.body.marginalEconomics.marginalChild).toBeDefined();
      expect(res.body.marginalEconomics.marginalChild.childNumber).toBe(151);
      expect(res.body.marginalEconomics.marginalChild.insight).toContain('приносить');

      expect(res.body.marginalEconomics.clubTeachersStatus).toBeDefined();
      expect(res.body.marginalEconomics.clubTeachersStatus.insight).toContain(
        'Поточний штат гуртків заповнений на'
      );

      expect(res.body.marginalEconomics.expansionAnalysis).toBeDefined();
      expect(res.body.marginalEconomics.expansionAnalysis.costJump.uah).toBeGreaterThan(0);
      expect(res.body.marginalEconomics.expansionAnalysis.insight).toContain(
        'Відкриття наступної групи вимагатиме стрибка витрат на'
      );
    });

    test('успішне прогнозування з динамічним віковим попитом: 200 OK', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ 2: 25, 3: 45, 4: 35, 5: 20 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.recommended).toBeDefined();
      expect(res.body.strategies.maxProfit).toBeDefined();
      expect(res.body.marginalEconomics).toBeDefined();
    });

    test.each([0, 300])('граничні значення: targetChildrenCount = %d -> 200 OK', async (count) => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: count });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.requestedDemand.totalChildren).toBe(count);
    });

    test('спроба передати 301 дитину (перевищення ліміту місткості) -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 301 });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('від’ємна кількість дітей -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: -1 });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('нечислове значення targetChildrenCount -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 'invalid' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('дробове значення targetChildrenCount -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 15.5 });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('порожній запит {} успішно повертає нульовий прогноз -> 200 OK', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({});

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.requestedDemand.totalChildren).toBe(0);
      expect(res.body.recommended.groupsCount).toBe(0);
    });

    test('запит з кастомними опціями attendanceRate та threshold -> 200 OK', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ targetChildrenCount: 50, attendanceRate: 0.9, threshold: 10 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.recommended.totalAdmitted).toBe(50);
    });

    test('запит одночасно з targetChildrenCount та віковими ключами повертає попередження -> 200 OK', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 100, 2: 12, 3: 12 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.requestedDemand.warning).toContain(
        'Параметр targetChildrenCount було проігноровано'
      );
      expect(res.body.requestedDemand.totalChildren).toBe(24);
      expect(res.body.recommended.totalAdmitted).toBe(24);
    });
  });
});
