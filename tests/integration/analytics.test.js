const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { analyticsRepository } = require('../../src/modules/analytics/analytics.repository');
const { analyticsService } = require('../../src/modules/analytics/analytics.service');
const { settingsRepository } = require('../../src/modules/settings/settings.repository');
const { settingsService } = require('../../src/modules/settings/settings.service');

const BASE = '/api/v1/analytics';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const MOCK_GROUP = {
  id: 2,
  name: 'Сонечко',
  age: 3,
  roomId: 6,
  educatorId: 7,
  assistantId: 11,
  educator: { id: 7, isActive: true },
  assistant: { id: 11, isActive: true },
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

const MOCK_CLUBS = [
  { id: 1, name: 'Музика' },
  { id: 2, name: 'Англійська' },
  { id: 3, name: 'Шахи' },
  { id: 4, name: 'Спорт' },
  { id: 5, name: 'Малювання' },
];

describe('Analytics API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    // Поточний місяць — листопад 2026 (21 робочий день): суми в тестах не залежать від дати запуску
    jest.spyOn(analyticsService, 'now').mockReturnValue(new Date('2026-11-16T10:00:00Z'));
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
        educatorId: 7,
        assistantId: 11,
        educator: { id: 7, isActive: true },
        assistant: { id: 11, isActive: true },
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
    jest.spyOn(analyticsRepository, 'findClubs').mockResolvedValue(MOCK_CLUBS);
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

      const res4 = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .send({ targetChildrenCount: 150 });
      expect(res4.status).toBe(StatusCodes.UNAUTHORIZED);
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

        const resForecastSchedule = await request(app)
          .post(`${BASE}/forecast/schedule`)
          .set('Authorization', tokenFor(role))
          .send({ targetChildrenCount: 150 });
        expect(resForecastSchedule.status).toBe(StatusCodes.FORBIDDEN);
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

      const resForecastSchedule = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor(role))
        .send({ targetChildrenCount: 150 });
      expect(resForecastSchedule.status).toBe(StatusCodes.OK);
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

    test('розрахунок профіту групи без помічника (assistantId: null) -> assistantSalary = 0', async () => {
      analyticsRepository.findGroupById.mockResolvedValueOnce({
        ...MOCK_GROUP,
        assistantId: null,
      });

      const res = await request(app)
        .get(`${BASE}/groups/2/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.expenses.educatorSalary.uah).toBe(4000);
      expect(res.body.expenses.assistantSalary.uah).toBe(0);
      expect(res.body.expenses.assistantSalary.kopiykas).toBe(0);
      expect(res.body.expenses.roomRent.uah).toBe(50000);
      expect(res.body.expenses.total.uah).toBe(54000);
      // Профіт: 41 940 - 54 000 = -12 060 грн
      expect(res.body.profit.uah).toBe(-12060);
    });

    test('розрахунок профіту групи з неактивним вихователем -> educatorSalary = 0', async () => {
      analyticsRepository.findGroupById.mockResolvedValueOnce({
        ...MOCK_GROUP,
        educator: { id: 7, isActive: false },
      });

      const res = await request(app)
        .get(`${BASE}/groups/2/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.expenses.educatorSalary.uah).toBe(0);
      expect(res.body.expenses.assistantSalary.uah).toBe(20000);
    });

    test('розрахунок профіту групи з неактивним помічником -> assistantSalary = 0', async () => {
      analyticsRepository.findGroupById.mockResolvedValueOnce({
        ...MOCK_GROUP,
        assistant: { id: 11, isActive: false },
      });

      const res = await request(app)
        .get(`${BASE}/groups/2/profit`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.expenses.educatorSalary.uah).toBe(4000);
      expect(res.body.expenses.assistantSalary.uah).toBe(0);
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

    test('харчування — за робочими днями місяця: без month поточний, ?month перекриває', async () => {
      const get = (query = '') =>
        request(app).get(`${BASE}/groups/2/profit${query}`).set('Authorization', tokenFor('ADMIN'));
      const [current, february, december] = await Promise.all([
        get(),
        get('?month=2026-02'),
        get('?month=2026-12'),
      ]);

      expect(current.body.calendar).toEqual({ month: '2026-11', workingDays: 21 });
      expect(february.body.calendar).toEqual({ month: '2026-02', workingDays: 20 });
      expect(december.body.calendar).toEqual({ month: '2026-12', workingDays: 23 });
      // 2 трирічки × 400 грн × дні × 0,8
      expect(current.body.mealIncome.uah).toBe(13440);
      expect(february.body.mealIncome.uah).toBe(12800);
      expect(december.body.mealIncome.uah).toBe(14720);
      // Навчання й витрати від місяця не залежать
      expect(february.body.tuitionIncome).toEqual(december.body.tuitionIncome);
      expect(february.body.expenses).toEqual(december.body.expenses);
    });

    test.each(['2026-13', '2026-1', '2026-11-01'])(
      'некоректний month=%s -> 400 VALIDATION_ERROR',
      async (month) => {
        const res = await request(app)
          .get(`${BASE}/groups/2/profit?month=${month}`)
          .set('Authorization', tokenFor('ADMIN'));
        expect(res.status).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      }
    );
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

    test('загальний профіт садка коли група без помічника -> assistantSalary = 0 у загальних витратах', async () => {
      analyticsRepository.findAllGroupsWithActiveChildren.mockResolvedValueOnce([
        {
          id: 2,
          name: 'Сонечко',
          age: 3,
          roomId: 6,
          educatorId: 7,
          assistantId: null,
          room: { id: 6, monthlyCost: 5000000 },
          children: MOCK_ACTIVE_CHILDREN,
          _count: { children: 2 },
        },
      ]);
      analyticsRepository.countActiveStaffByType.mockResolvedValueOnce({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 0,
      });

      const res = await request(app).get(`${BASE}/profit`).set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.expenses.assistantsSalary.uah).toBe(0);
      expect(res.body.expenses.assistantsSalary.kopiykas).toBe(0);
      expect(res.body.assistantsCount).toBe(0);
    });

    test('загальний профіт садка коли в групі неактивні вихователь і помічник -> зарплати = 0', async () => {
      analyticsRepository.findAllGroupsWithActiveChildren.mockResolvedValueOnce([
        {
          id: 2,
          name: 'Сонечко',
          age: 3,
          roomId: 6,
          educatorId: 7,
          educator: { id: 7, isActive: false },
          assistantId: 11,
          assistant: { id: 11, isActive: false },
          room: { id: 6, monthlyCost: 5000000 },
          children: MOCK_ACTIVE_CHILDREN,
          _count: { children: 2 },
        },
      ]);
      analyticsRepository.countActiveStaffByType.mockResolvedValueOnce({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 0,
        ASSISTANT: 0,
      });

      const res = await request(app).get(`${BASE}/profit`).set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.expenses.educatorsSalary.uah).toBe(0);
      expect(res.body.expenses.assistantsSalary.uah).toBe(0);
      expect(res.body.groups[0].expenses.uah).toBe(50000); // лише оренда кімнати
      expect(res.body.educatorsCount).toBe(0);
      expect(res.body.assistantsCount).toBe(0);
    });

    test('невалідний attendanceRate в query для загального профіту -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get(`${BASE}/profit?attendanceRate=-0.5`)
        .set('Authorization', tokenFor('ADMIN'));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('?month: різна кількість робочих днів дає різне харчування і профіт', async () => {
      const get = (query) =>
        request(app).get(`${BASE}/profit${query}`).set('Authorization', tokenFor('ADMIN'));
      const [february, december] = await Promise.all([
        get('?month=2026-02'),
        get('?month=2026-12'),
      ]);

      expect(february.status).toBe(StatusCodes.OK);
      expect(february.body.calendar).toEqual({ month: '2026-02', workingDays: 20 });
      expect(december.body.calendar).toEqual({ month: '2026-12', workingDays: 23 });
      expect(february.body.income.meal.uah).toBe(12800);
      expect(december.body.income.meal.uah).toBe(14720);
      expect(february.body.expenses).toEqual(december.body.expenses);
      expect(december.body.profit.uah - february.body.profit.uah).toBe(14720 - 12800);
    });

    test('некоректний month -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get(`${BASE}/profit?month=december`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('після PATCH /settings/holidays профіт рахується з новими святами', async () => {
      jest.spyOn(settingsRepository, 'upsert').mockImplementation(async (key, value) => ({
        key,
        value,
      }));
      const profitFor = () =>
        request(app).get(`${BASE}/profit?month=2026-12`).set('Authorization', tokenFor('MANAGER'));
      const patchHolidays = (value) =>
        request(app)
          .patch('/api/v1/settings/holidays')
          .set('Authorization', tokenFor('ADMIN'))
          .send({ value });

      const before = await profitFor();
      expect((await patchHolidays(['2026-12-25', '2026-12-31'])).status).toBe(StatusCodes.OK);
      const after = await profitFor();
      await patchHolidays([]); // повертаємо кеш налаштувань до початкового стану
      expect(settingsService.get('HOLIDAYS')).toEqual([]);

      expect(before.body.calendar.workingDays).toBe(23);
      expect(after.body.calendar.workingDays).toBe(21);
      expect(after.body.income.meal.uah).toBeLessThan(before.body.income.meal.uah);
    });

    test('враховує додаткових помічників у штаті, нараховуючи їм базову зарплату', async () => {
      analyticsRepository.countActiveStaffByType.mockResolvedValueOnce({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 3, // 1 група -> 2 вільних помічники по 20 000 грн = +40 000 грн
      });

      const res = await request(app).get(`${BASE}/profit`).set('Authorization', tokenFor('ADMIN'));

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

    test('робочі дні беруться з календаря місяця прогнозу', async () => {
      const send = (month) =>
        request(app)
          .post(`${BASE}/forecast`)
          .set('Authorization', tokenFor('ADMIN'))
          .send({ 2: 20, 3: 20, 4: 20, 5: 20, month });
      const february = await send('2026-02');
      const december = await send('2026-12');
      expect(february.status).toBe(StatusCodes.OK);
      expect(february.body.calendar).toEqual({ month: '2026-02', workingDays: 20 });
      expect(december.body.calendar).toEqual({ month: '2026-12', workingDays: 23 });
      expect(february.body.recommended.financials.mealIncome.kopiykas).toBeLessThan(
        december.body.recommended.financials.mealIncome.kopiykas
      );
    });

    test('некоректний month -> 400', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 10, month: '2026-13' });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details[0].message).toBe('month must be in YYYY-MM format');
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

  describe('POST /api/v1/analytics/forecast/schedule', () => {
    test('успішне прогнозування розкладу для targetChildrenCount = 150: 200 OK з валідним розкладом', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 150 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.feasible).toBe(true);
      expect(res.body.strategy).toBe('recommended');
      expect(res.body.groupsCount).toBeGreaterThanOrEqual(8);
      expect(res.body.childrenCount).toBe(150);
      expect(res.body.clubsCount).toBe(5);
      expect(res.body.maxFeasibleGroups).toBe(15);
      expect(res.body.groups.length).toBe(res.body.groupsCount);
      expect(res.body.slots.length).toBeGreaterThan(0);
      expect(res.body.summary.lessonSlots).toBeGreaterThan(0);
      expect(res.body.summary.walkSlots).toBeGreaterThan(0);
      expect(res.body.summary.mealSlots).toBeGreaterThan(0);
      expect(res.body.summary.teacherWorkload.utilizationRatePercent).toBeGreaterThan(0);
      expect(res.body.conflicts).toEqual([]);
      expect(res.body.calendar).toBeDefined();
    });

    test('прогнозування розкладу для вікового попиту { 2: 15, 3: 15, 4: 15, 5: 15 }', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ 2: 15, 3: 15, 4: 15, 5: 15, month: '2026-11' });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.feasible).toBe(true);
      expect(res.body.childrenCount).toBe(60);
      expect(res.body.calendar).toEqual({ month: '2026-11', workingDays: 21 });
      expect(res.body.groups.some((g) => g.age === 2)).toBe(true);
      expect(res.body.slots.every((s) => s.dayOfWeek >= 1 && s.dayOfWeek <= 5)).toBe(true);
    });

    test('підтримка вибору конкретної стратегії (наприклад minimalInfrastructure)', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 150, strategy: 'minimalInfrastructure' });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.feasible).toBe(true);
      expect(res.body.strategy).toBe('minimalInfrastructure');
      expect(res.body.groupsCount).toBe(8); // 150 / 20 = 8 груп
    });

    test('порожній запит або targetChildrenCount = 0 повертає 200 OK з пустим розкладом', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 0 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.feasible).toBe(true);
      expect(res.body.groupsCount).toBe(0);
      expect(res.body.childrenCount).toBe(0);
      expect(res.body.groups).toEqual([]);
      expect(res.body.slots).toEqual([]);
      expect(res.body.summary.totalSlots).toBe(0);
      expect(res.body.conflicts).toEqual([]);
    });

    test('невалідний month -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ month: 'invalid-month' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('targetChildrenCount > 300 -> 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`${BASE}/forecast/schedule`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ targetChildrenCount: 350 });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });
});
