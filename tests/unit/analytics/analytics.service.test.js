const {
  AnalyticsService,
  analyticsService,
  toMoney,
  formatVariantFinancials,
  formatOptimalForecastMoney,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  DEFAULT_TOTAL_ROOMS_COUNT,
  DEFAULT_FORECAST_MONTHS,
  FORECAST_AGES,
  FORECAST_ASSUMPTIONS,
} = require('../../../src/modules/analytics/analytics.service');
const { NotFoundError, BadRequestError } = require('../../../src/errors/AppError');

describe('AnalyticsService', () => {
  let mockRepo;
  let mockSettings;
  let service;

  const DEFAULT_SETTINGS = {
    TUITION_MONTHLY: 1500000,
    DISCOUNT_LEVELS: [10, 20, 30],
    EDUCATOR_PER_CHILD: 200000,
    EDUCATOR_EXTRA_PAY: 300000,
    ASSISTANT_SALARY: 2000000,
    ASSISTANT_EXTRA_PAY: 300000,
    GROUP_EXTRA_PAY_THRESHOLD: 12,
    CLUB_TEACHER_SALARY: 4000000,
    MANAGER_SALARY: 8000000,
    ROOM_MONTHLY_COST: 5000000,
    DEFAULT_ROOMS_COUNT: 20,
    MAX_CHILDREN_IN_GROUP: 20,
    YEARLY_DISCOUNT_PERCENT: 12,
    WORKING_DAYS_PER_MONTH: 21,
    ATTENDANCE_RATE_PERCENT: 80,
  };

  beforeEach(() => {
    mockRepo = {
      findGroupById: jest.fn(),
      findAllActiveChildren: jest.fn(),
      findAllGroupsWithActiveChildren: jest.fn(),
      countActiveStaffByType: jest.fn().mockResolvedValue(null),
    };
    mockSettings = {
      get: jest.fn((key) => DEFAULT_SETTINGS[key]),
    };
    service = new AnalyticsService(mockRepo, mockSettings);
  });

  test('експортує дефолтний екземпляр analyticsService та константи', () => {
    expect(analyticsService).toBeInstanceOf(AnalyticsService);
    expect(DEFAULT_CLUB_TEACHERS_COUNT).toBe(5);
    expect(DEFAULT_MANAGERS_COUNT).toBe(1);
    expect(DEFAULT_TOTAL_ROOMS_COUNT).toBe(20);
  });

  describe('toMoney', () => {
    test('конвертує додатну суму в копійках у гривні та копійки', () => {
      const money = toMoney(1500000);
      expect(money).toEqual({
        uah: 15000,
        kopiykas: 1500000,
      });
    });

    test('конвертує 0 копійок', () => {
      const money = toMoney(0);
      expect(money).toEqual({
        uah: 0,
        kopiykas: 0,
      });
    });

    test('конвертує від’ємну суму в копійках', () => {
      const money = toMoney(-7000000);
      expect(money).toEqual({
        uah: -70000,
        kopiykas: -7000000,
      });
    });
  });

  describe('getGroupProfit', () => {
    test('викидає BadRequestError якщо groupId не є валідним додатним цілим числом', async () => {
      await expect(service.getGroupProfit('invalid')).rejects.toThrow(BadRequestError);
      await expect(service.getGroupProfit(-5)).rejects.toThrow(BadRequestError);
      await expect(service.getGroupProfit(0)).rejects.toThrow(BadRequestError);
    });

    test('викидає NotFoundError якщо групу не знайдено', async () => {
      mockRepo.findGroupById.mockResolvedValue(null);

      await expect(service.getGroupProfit(999)).rejects.toThrow(NotFoundError);
      await expect(service.getGroupProfit(999)).rejects.toThrow('Групу не знайдено');
    });

    test('розраховує профіт для порожньої групи (0 дітей)', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        assistantId: 2,
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [],
      });

      const res = await service.getGroupProfit(1);

      expect(res.groupId).toBe(1);
      expect(res.childrenCount).toBe(0);
      // Дохід = 0
      expect(res.income.tuition.uah).toBe(0);
      expect(res.income.tuition.kopiykas).toBe(0);
      expect(res.income.total.uah).toBe(0);
      // Витрати: вихователь 0, помічник 20 000 грн (2 000 000 коп), оренда 50 000 грн (5 000 000 коп)
      expect(res.expenses.educatorSalary.uah).toBe(0);
      expect(res.expenses.assistantSalary.uah).toBe(20000);
      expect(res.expenses.assistantSalary.kopiykas).toBe(2000000);
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.roomRent.kopiykas).toBe(5000000);
      expect(res.expenses.total.uah).toBe(70000);
      expect(res.expenses.total.kopiykas).toBe(7000000);
      // Профіт: 0 - 70 000 = -70 000 грн
      expect(res.profit.uah).toBe(-70000);
      expect(res.profit.kopiykas).toBe(-7000000);
    });

    test('розраховує профіт для групи без помічника (assistantId: null) -> assistantSalary = 0', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        assistantId: null,
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(2000);
      expect(res.expenses.assistantSalary.uah).toBe(0);
      expect(res.expenses.assistantSalary.kopiykas).toBe(0);
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.total.uah).toBe(52000);
    });

    test('розраховує профіт для групи без вихователя (educatorId: null) -> educatorSalary = 0', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: null,
        assistantId: 2,
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(0);
      expect(res.expenses.educatorSalary.kopiykas).toBe(0);
      expect(res.expenses.assistantSalary.uah).toBe(20000);
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.total.uah).toBe(70000);
    });

    test('розраховує профіт для групи без персоналу (educatorId: null, assistantId: null) -> зарплати = 0', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: null,
        assistantId: null,
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(0);
      expect(res.expenses.assistantSalary.uah).toBe(0);
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.total.uah).toBe(50000);
    });

    test('розраховує профіт для групи з неактивним вихователем (educator.isActive: false) -> educatorSalary = 0', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        educator: { id: 1, isActive: false },
        assistantId: 2,
        assistant: { id: 2, isActive: true },
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(0);
      expect(res.expenses.educatorSalary.kopiykas).toBe(0);
      expect(res.expenses.assistantSalary.uah).toBe(20000);
    });

    test('розраховує профіт для групи з неактивним помічником (assistant.isActive: false) -> assistantSalary = 0', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        educator: { id: 1, isActive: true },
        assistantId: 2,
        assistant: { id: 2, isActive: false },
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(2000);
      expect(res.expenses.assistantSalary.uah).toBe(0);
      expect(res.expenses.assistantSalary.kopiykas).toBe(0);
    });

    test('isStaffActive: коректно розпізнає співробітника як активного, якщо реляція завантажена без поля isActive', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        educator: { id: 1, fullName: 'Марія' }, // без поля isActive
        assistantId: 2,
        assistant: { id: 2, fullName: 'Олена' }, // без поля isActive
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' }],
      });

      const res = await service.getGroupProfit(1);

      expect(res.expenses.educatorSalary.uah).toBe(2000);
      expect(res.expenses.assistantSalary.uah).toBe(20000);
    });

    test('коректно розраховує зарплати якщо children=undefined, але є _count з кількістю дітей', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 1,
        name: 'Сонечко',
        roomId: 10,
        educatorId: 1,
        assistantId: 2,
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: undefined,
        _count: { children: 5 },
      });

      const res = await service.getGroupProfit(1);

      expect(res.childrenCount).toBe(5);
      expect(res.expenses.educatorSalary.uah).toBe(10000); // 5 * 2 000 = 10 000 грн
      expect(res.expenses.assistantSalary.uah).toBe(20000);
      expect(res.income.tuition.uah).toBe(0);
    });

    test('розраховує профіт для групи з 15 дітьми та різними пільгами', async () => {
      // 10 дітей без пільги: 10 * 15 000 = 150 000 грн (15 000 000 коп)
      // 3 дітей з пільгою 10%: 3 * 13 500 = 40 500 грн (4 050 000 коп)
      // 2 дітей з пільгою 20%: 2 * 12 000 = 24 000 грн (2 400 000 коп)
      // Всього дохід: 214 500 грн (21 450 000 коп)
      const children = [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          fullName: `Дитина ${i + 1}`,
          discountPercent: 0,
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: i + 11,
          fullName: `Дитина ${i + 11}`,
          discountPercent: 10,
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          id: i + 14,
          fullName: `Дитина ${i + 14}`,
          discountPercent: 20,
        })),
      ];

      mockRepo.findGroupById.mockResolvedValue({
        id: 2,
        name: 'Чомусики',
        roomId: 12,
        educatorId: 1,
        assistantId: 2,
        room: { id: 12, name: 'Кімната 12', monthlyCost: 5000000 },
        children,
      });

      const res = await service.getGroupProfit(2);

      expect(res.groupId).toBe(2);
      expect(res.childrenCount).toBe(15);
      // Дохід
      expect(res.income.tuition.uah).toBe(214500);
      expect(res.income.tuition.kopiykas).toBe(21450000);
      expect(res.income.total.uah).toBe(214500);

      // Витрати:
      // Вихователь: 15 * 2 000 + (15 - 12) * 3 000 = 30 000 + 9 000 = 39 000 грн (3 900 000 коп)
      expect(res.expenses.educatorSalary.uah).toBe(39000);
      expect(res.expenses.educatorSalary.kopiykas).toBe(3900000);
      // Помічник: 20 000 + (15 - 12) * 3 000 = 29 000 грн (2 900 000 коп)
      expect(res.expenses.assistantSalary.uah).toBe(29000);
      expect(res.expenses.assistantSalary.kopiykas).toBe(2900000);
      // Оренда: 50 000 грн (5 000 000 коп)
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.roomRent.kopiykas).toBe(5000000);
      // Разом витрати: 39 000 + 29 000 + 50 000 = 118 000 грн (11 800 000 коп)
      expect(res.expenses.total.uah).toBe(118000);
      expect(res.expenses.total.kopiykas).toBe(11800000);

      // Профіт: 214 500 - 118 000 = 96 500 грн (9 650 000 коп)
      expect(res.profit.uah).toBe(96500);
      expect(res.profit.kopiykas).toBe(9650000);

      // Перевірка детальної розбивки breakdown
      expect(res.breakdown.income.tuition.uah).toBe(214500);
      expect(res.breakdown.expenses.educatorSalary.uah).toBe(39000);
      expect(res.breakdown.expenses.assistantSalary.uah).toBe(29000);
      expect(res.breakdown.expenses.roomRent.uah).toBe(50000);
      expect(res.breakdown.expenses.total.uah).toBe(118000);
    });

    test('використовує дефолтну вартість кімнати, якщо кімната в групі не має monthlyCost або room=null', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 3,
        name: 'Пізнайки',
        roomId: 5,
        room: null,
        children: [{ id: 1, discountPercent: 0 }],
      });

      const res = await service.getGroupProfit(3);

      expect(res.room.id).toBe(5);
      expect(res.room.name).toBeNull();
      expect(res.expenses.roomRent.uah).toBe(50000);
      expect(res.expenses.roomRent.kopiykas).toBe(5000000);
    });

    test('враховує дохід від харчування за віком групи та коефіцієнт відвідуваності', async () => {
      mockRepo.findGroupById.mockResolvedValue({
        id: 4,
        name: 'Чомусики',
        age: 3,
        roomId: 7,
        educatorId: 1,
        assistantId: 2,
        room: { id: 7, name: 'Кімната 7', monthlyCost: 5000000 },
        children: [
          { id: 1, discountPercent: 0 },
          { id: 2, discountPercent: 10 },
        ],
      });

      // За замовчуванням attendanceRate = 0.8:
      const res = await service.getGroupProfit(4);

      expect(res.age).toBe(3);
      expect(res.childrenCount).toBe(2);
      // Навчання: 15 000 + 13 500 = 28 500 грн
      expect(res.tuitionIncome.uah).toBe(28500);
      // Харчування 3-річок (80% відвідуваність): (400 * 21 * 0.8) = 6 720 грн на дитину * 2 = 13 440 грн
      expect(res.mealIncome.uah).toBe(13440);
      expect(res.mealIncome.kopiykas).toBe(1344000);
      // Сумарний дохід: 28 500 + 13 440 = 41 940 грн
      expect(res.totalIncome.uah).toBe(41940);
      expect(res.income.total.uah).toBe(41940);
      // Витрати: вихователь 4 000 + помічник 20 000 + оренда 50 000 = 74 000 грн
      expect(res.expenses.total.uah).toBe(74000);
      // Профіт: 41 940 - 74 000 = -32 060 грн
      expect(res.profit.uah).toBe(-32060);

      // При передачі attendanceRate = 1.0 (100%):
      const resFull = await service.getGroupProfit(4, { attendanceRate: 1 });
      expect(resFull.mealIncome.uah).toBe(16800);
      expect(resFull.totalIncome.uah).toBe(45300);
      expect(resFull.profit.uah).toBe(-28700);
    });

    test('робочі дні і відвідуваність за замовчуванням беруться з налаштувань, query їх перекриває', async () => {
      mockSettings.get.mockImplementation((key) => {
        if (key === 'WORKING_DAYS_PER_MONTH') return 20;
        if (key === 'ATTENDANCE_RATE_PERCENT') return 50;
        return DEFAULT_SETTINGS[key];
      });
      mockRepo.findGroupById.mockResolvedValue({
        id: 4,
        name: 'Чомусики',
        age: 3,
        roomId: 7,
        educatorId: 1,
        assistantId: 2,
        room: { id: 7, name: 'Кімната 7', monthlyCost: 5000000 },
        children: [
          { id: 1, discountPercent: 0 },
          { id: 2, discountPercent: 0 },
        ],
      });

      // 3-річки: 400 грн/день × 20 днів × 0,5 = 4 000 грн на дитину × 2 = 8 000 грн
      const res = await service.getGroupProfit(4);
      expect(res.mealIncome.uah).toBe(8000);

      // query-параметр перекриває налаштування: 400 × 20 × 1 × 2 = 16 000 грн
      const resFull = await service.getGroupProfit(4, { attendanceRate: 1 });
      expect(resFull.mealIncome.uah).toBe(16000);
    });

    test('враховує річну знижку 12% для дітей з paymentPlan: YEARLY', async () => {
      // 1 дитина без пільги, MONTHLY: 15 000 грн (1 500 000 коп)
      // 1 дитина без пільги, YEARLY: 15 000 * 0.88 = 13 200 грн (1 320 000 коп)
      // 1 дитина з пільгою 20%, YEARLY: 12 000 * 0.88 = 10 560 грн (1 056 000 коп)
      // Разом навчання: 15 000 + 13 200 + 10 560 = 38 760 грн (3 876 000 коп)
      mockRepo.findGroupById.mockResolvedValue({
        id: 5,
        name: 'Розумники',
        age: 4,
        roomId: 8,
        room: { id: 8, name: 'Кімната 8', monthlyCost: 5000000 },
        children: [
          { id: 1, discountPercent: 0, paymentPlan: 'MONTHLY' },
          { id: 2, discountPercent: 0, paymentPlan: 'YEARLY' },
          { id: 3, discountPercent: 20, paymentPlan: 'YEARLY' },
        ],
      });

      const res = await service.getGroupProfit(5, { attendanceRate: 1 });

      expect(res.childrenCount).toBe(3);
      expect(res.tuitionIncome.uah).toBe(38760);
      expect(res.tuitionIncome.kopiykas).toBe(3876000);
      // 3 дитини 4-річки, 100% відвідуваність: 3 * (500 * 21) = 31 500 грн
      expect(res.mealIncome.uah).toBe(31500);
      expect(res.totalIncome.uah).toBe(70260);
    });
  });

  describe('getTotalProfit', () => {
    test('розраховує загальний профіт садка для порожнього садка (0 дітей, 0 груп)', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([]);

      const res = await service.getTotalProfit();

      expect(res.activeChildrenCount).toBe(0);
      expect(res.groupsCount).toBe(0);
      expect(res.roomsCount).toBe(20);
      expect(res.clubTeachersCount).toBe(5);
      expect(res.managersCount).toBe(1);

      // Дохід = 0
      expect(res.income.tuition.uah).toBe(0);
      expect(res.income.total.uah).toBe(0);

      // Витрати:
      // 0 вихователів, 0 помічників
      expect(res.expenses.educatorsSalary.uah).toBe(0);
      expect(res.expenses.assistantsSalary.uah).toBe(0);
      // 5 викладачів гуртків по 40 000 грн = 200 000 грн
      expect(res.expenses.clubTeachersSalary.uah).toBe(200000);
      expect(res.expenses.clubTeachersSalary.kopiykas).toBe(20000000);
      // Менеджер 80 000 грн
      expect(res.expenses.managerSalary.uah).toBe(80000);
      expect(res.expenses.managerSalary.kopiykas).toBe(8000000);
      // Всі працівники разом: 280 000 грн
      expect(res.expenses.staffSalaries.uah).toBe(280000);
      // 20 кімнат по 50 000 грн = 1 000 000 грн
      expect(res.expenses.roomsRent.uah).toBe(1000000);
      expect(res.expenses.roomsRent.kopiykas).toBe(100000000);
      // Загальні витрати: 280 000 + 1 000 000 = 1 280 000 грн
      expect(res.expenses.total.uah).toBe(1280000);
      expect(res.expenses.total.kopiykas).toBe(128000000);

      // Чистий профіт: -1 280 000 грн
      expect(res.profit.uah).toBe(-1280000);
      expect(res.profit.kopiykas).toBe(-128000000);
      expect(res.netProfit.uah).toBe(-1280000);
    });

    test('розраховує загальний профіт садка з групами, дітьми та пільгами', async () => {
      // 2 групи:
      // Група 1: 10 дітей без пільг -> 10 * 15 000 = 150 000 грн
      //   Вихователь: 10 * 2 000 = 20 000 грн
      //   Помічник: 20 000 грн
      // Група 2: 14 дітей (10 без пільг, 2 з 10%, 2 з 30%)
      //   10 * 15 000 = 150 000
      //   2 * 13 500 = 27 000
      //   2 * 10 500 = 21 000
      //   Сума групи 2: 198 000 грн
      //   Вихователь: 14 * 2 000 + 2 * 3 000 = 34 000 грн
      //   Помічник: 20 000 + 2 * 3 000 = 26 000 грн
      // Додатково 1 активна дитина без групи зі знижкою 20%: 12 000 грн
      // Загальний дохід: 150 000 + 198 000 + 12 000 = 360 000 грн (36 000 000 коп)

      const activeChildren = [
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, discountPercent: 0, groupId: 1 })),
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 11, discountPercent: 0, groupId: 2 })),
        { id: 21, discountPercent: 10, groupId: 2 },
        { id: 22, discountPercent: 10, groupId: 2 },
        { id: 23, discountPercent: 30, groupId: 2 },
        { id: 24, discountPercent: 30, groupId: 2 },
        { id: 25, discountPercent: 20, groupId: null },
      ];

      const groups = [
        {
          id: 1,
          name: 'Сонечко',
          educatorId: 1,
          assistantId: 1,
          room: { id: 1, monthlyCost: 5000000 },
          children: activeChildren.filter((c) => c.groupId === 1),
          _count: { children: 10 },
        },
        {
          id: 2,
          name: 'Дзвіночок',
          educatorId: 2,
          assistantId: 2,
          room: { id: 2, monthlyCost: 5000000 },
          children: activeChildren.filter((c) => c.groupId === 2),
          _count: { children: 14 },
        },
      ];

      mockRepo.findAllActiveChildren.mockResolvedValue(activeChildren);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue(groups);

      const res = await service.getTotalProfit();

      expect(res.activeChildrenCount).toBe(24);
      expect(res.assignedChildrenCount).toBe(24);
      expect(res.groupsCount).toBe(2);
      expect(res.educatorsCount).toBe(2);
      expect(res.assistantsCount).toBe(2);

      // Дохід від навчання 24 дітей у групах
      expect(res.income.tuition.uah).toBe(348000);
      expect(res.income.tuition.kopiykas).toBe(34800000);

      // Витрати:
      // Вихователі: 20 000 + 34 000 = 54 000 грн (5 400 000 коп)
      expect(res.expenses.educatorsSalary.uah).toBe(54000);
      expect(res.expenses.educatorsSalary.kopiykas).toBe(5400000);
      // Помічники: 20 000 + 26 000 = 46 000 грн (4 600 000 коп)
      expect(res.expenses.assistantsSalary.uah).toBe(46000);
      expect(res.expenses.assistantsSalary.kopiykas).toBe(4600000);
      // 5 викладачів гуртків: 200 000 грн (20 000 000 коп)
      expect(res.expenses.clubTeachersSalary.uah).toBe(200000);
      // 1 менеджер: 80 000 грн (8 000 000 коп)
      expect(res.expenses.managerSalary.uah).toBe(80000);
      // Разом персонал: 54 000 + 46 000 + 200 000 + 80 000 = 380 000 грн (38 000 000 коп)
      expect(res.expenses.staffSalaries.uah).toBe(380000);
      // Оренда 20 кімнат: 1 000 000 грн (100 000 000 коп)
      expect(res.expenses.roomsRent.uah).toBe(1000000);
      // Разом витрати: 380 000 + 1 000 000 = 1 380 000 грн (138 000 000 коп)
      expect(res.expenses.total.uah).toBe(1380000);
      expect(res.expenses.total.kopiykas).toBe(138000000);

      // Чистий профіт: 348 000 - 1 380 000 = -1 032 000 грн (-103 200 000 коп)
      expect(res.profit.uah).toBe(-1032000);
      expect(res.profit.kopiykas).toBe(-103200000);

      // Перевірка списку груп groups
      expect(res.groups).toHaveLength(2);
      expect(res.groups[0]).toEqual({
        groupId: 1,
        groupName: 'Сонечко',
        age: undefined,
        childrenCount: 10,
        tuitionIncome: toMoney(15000000),
        mealIncome: toMoney(0),
        totalIncome: toMoney(15000000),
        income: toMoney(15000000),
        expenses: toMoney(9000000), // 20k + 20k + 50k = 90k
        profit: toMoney(6000000), // 150k - 90k = 60k
      });
      // unassignedChildren не повертається
      expect(res.unassignedChildren).toBeUndefined();
      // Перевірка розмежування кімнат
      expect(res.rooms.total).toBe(20);
      expect(res.rooms.occupied).toBe(7); // 2 групи + 5 гуртків
      expect(res.rooms.vacant).toBe(13);
      expect(res.rooms.cost.operating.uah).toBe(350000);
      expect(res.rooms.cost.idle.uah).toBe(650000);
      expect(res.rooms.cost.total.uah).toBe(1000000);
    });

    test('враховує річну знижку 12% для дітей з paymentPlan: YEARLY у загальному профіті', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Сонечко',
          age: 2,
          room: { id: 1, monthlyCost: 5000000 },
          children: [
            { id: 1, discountPercent: 0, paymentPlan: 'YEARLY' },
            { id: 2, discountPercent: 10, paymentPlan: 'YEARLY' },
          ],
        },
      ]);

      const res = await service.getTotalProfit({ attendanceRate: 1 });

      // Дитина 1: 15 000 * 0.88 = 13 200 грн (1 320 000 коп)
      // Дитина 2: 13 500 * 0.88 = 11 880 грн (1 188 000 коп)
      // Разом навчання: 25 080 грн (2 508 000 коп)
      expect(res.income.tuition.uah).toBe(25080);
      expect(res.income.tuition.kopiykas).toBe(2508000);
    });

    test('робочі дні і відвідуваність за замовчуванням беруться з налаштувань, query їх перекриває', async () => {
      mockSettings.get.mockImplementation((key) => {
        if (key === 'WORKING_DAYS_PER_MONTH') return 20;
        if (key === 'ATTENDANCE_RATE_PERCENT') return 50;
        return DEFAULT_SETTINGS[key];
      });
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Чомусики',
          age: 3,
          room: { id: 1, monthlyCost: 5000000 },
          children: [
            { id: 1, discountPercent: 0 },
            { id: 2, discountPercent: 0 },
          ],
        },
      ]);

      // 3-річки: 400 грн/день × 20 днів × 0,5 × 2 дитини = 8 000 грн
      const res = await service.getTotalProfit();
      expect(res.income.meal.uah).toBe(8000);

      const resFull = await service.getTotalProfit({ attendanceRate: 1 });
      expect(resFull.income.meal.uah).toBe(16000);
    });

    test('getTotalProfit використовує defaultRoomCost якщо кімната в групі не задана', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Без кімнати',
          educatorId: 1,
          assistantId: 2,
          room: null,
          children: [],
        },
      ]);
      const res = await service.getTotalProfit();
      expect(res.groups[0].expenses.uah).toBe(70000); // 0 + 20000 + 50000
    });

    // Поведінку змінено відносно попередньої версії: раніше roomsRent садка обрізався до
    // roomsCount × ROOM_MONTHLY_COST (20 × 50 000), і GET /profit розходився із сумою профітів груп
    test('дорога кімната групи: roomsRent = оренда груп + кабінетів, профіт = сума груп − спільні', async () => {
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Дорога кімната',
          age: 3,
          educatorId: 1,
          assistantId: 2,
          educator: { id: 1, isActive: true },
          assistant: { id: 2, isActive: true },
          room: { id: 1, monthlyCost: 100000000 }, // 1 000 000 грн — більше за весь фонд 20 кімнат
          children: [],
          _count: { children: 0 },
        },
      ]);
      const res = await service.getTotalProfit();
      const operating = 100000000 + 5 * 5000000; // кімната групи + 5 кабінетів гуртків
      expect(res.expenses.operatingRoomsRent.kopiykas).toBe(operating);
      expect(res.expenses.idleRoomsRent.kopiykas).toBe(0);
      expect(res.expenses.roomsRent.kopiykas).toBe(operating);
      expect(res.expenses.roomsRent.kopiykas).toBeGreaterThan(20 * 5000000);
      expect(res.rooms.cost.total).toEqual(res.expenses.roomsRent);

      const shared = 5 * 4000000 + 8000000 + 5 * 5000000; // гуртки, менеджер, кабінети
      expect(res.profit.kopiykas).toBe(res.groups[0].profit.kopiykas - shared);
    });

    test('група без помічника: у загальних витратах садка зарплата помічника = 0', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([{ id: 1, discountPercent: 0, groupId: 1 }]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Сонечко',
          educatorId: 1,
          assistantId: null, // Без помічника
          room: { id: 1, monthlyCost: 5000000 },
          children: [{ id: 1, discountPercent: 0, groupId: 1 }],
          _count: { children: 1 },
        },
      ]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 0,
      });

      const res = await service.getTotalProfit();

      // Зарплата помічників = 0 грн (як у садка, так і в групі)
      expect(res.expenses.assistantsSalary.uah).toBe(0);
      expect(res.expenses.assistantsSalary.kopiykas).toBe(0);
      expect(res.groups[0].expenses.uah).toBe(52000); // 2000 вихователь + 0 помічник + 50000 оренда
      expect(res.assistantsCount).toBe(0);
      expect(res.educatorsCount).toBe(1);
    });

    test('група без вихователя: у загальних витратах садка зарплата вихователя = 0', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([{ id: 1, discountPercent: 0, groupId: 1 }]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Сонечко',
          educatorId: null, // Без вихователя
          assistantId: 2,
          room: { id: 1, monthlyCost: 5000000 },
          children: [{ id: 1, discountPercent: 0, groupId: 1 }],
          _count: { children: 1 },
        },
      ]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 0,
        ASSISTANT: 1,
      });

      const res = await service.getTotalProfit();

      expect(res.expenses.educatorsSalary.uah).toBe(0);
      expect(res.expenses.educatorsSalary.kopiykas).toBe(0);
      expect(res.expenses.assistantsSalary.uah).toBe(20000);
      expect(res.groups[0].expenses.uah).toBe(70000); // 0 вихователь + 20000 помічник + 50000 оренда
      expect(res.educatorsCount).toBe(0);
      expect(res.assistantsCount).toBe(1);
    });

    test('архітектурні інваріанти садка: сума доходів груп = загальний дохід, зарплати збігаються, різниця профітів = оверхед', async () => {
      const activeChildren = [
        { id: 1, discountPercent: 0, groupId: 1 },
        { id: 2, discountPercent: 10, groupId: 1 },
        { id: 3, discountPercent: 0, groupId: 2 },
      ];
      const groups = [
        {
          id: 1,
          name: 'Група з повним складом',
          age: 2,
          educatorId: 10,
          assistantId: 20,
          room: { id: 1, monthlyCost: 5000000 },
          children: [activeChildren[0], activeChildren[1]],
          _count: { children: 2 },
        },
        {
          id: 2,
          name: 'Група без помічника',
          age: 3,
          educatorId: 11,
          assistantId: null,
          room: { id: 2, monthlyCost: 5000000 },
          children: [activeChildren[2]],
          _count: { children: 1 },
        },
      ];

      mockRepo.findAllActiveChildren.mockResolvedValue(activeChildren);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue(groups);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 2,
        ASSISTANT: 1,
      });

      const res = await service.getTotalProfit();

      // Інваріант 1: Сума доходів груп = загальний дохід садка
      const sumGroupsIncome = res.groups.reduce((acc, g) => acc + g.income.uah, 0);
      expect(res.income.total.uah).toBe(sumGroupsIncome);

      // Інваріант 2: Сума зарплат вихователів у групах = totalEducatorsSalary
      const sumEducatorSalaries = 2 * 2000 + 1 * 2000; // 4000 + 2000 = 6000 грн
      expect(res.expenses.educatorsSalary.uah).toBe(sumEducatorSalaries);

      // Інваріант 3: Сума зарплат помічників у групах = totalAssistantsSalary (оскільки вільних немає: 1 призначений і 1 у штаті)
      expect(res.expenses.assistantsSalary.uah).toBe(20000);

      // Інваріант 4: Загальний прибуток = загальний дохід - загальні витрати
      expect(res.profit.uah).toBe(res.income.total.uah - res.expenses.total.uah);

      // Інваріант 5: Різниця між сумою профітів груп та загальним профітом садка строго дорівнює оверхеду (гуртківці + менеджер + негрупова оренда)
      const sumGroupsProfit = res.groups.reduce((acc, g) => acc + g.profit.uah, 0);
      const overhead =
        res.expenses.clubTeachersSalary.uah +
        res.expenses.managerSalary.uah +
        (res.expenses.roomsRent.uah - 2 * 50000); // 18 негрупових кімнат по 50 000 = 900 000 грн
      expect(sumGroupsProfit - res.profit.uah).toBe(overhead);
    });

    test('враховує фактичну кількість персоналу з таблиці Staff у БД через countActiveStaffByType', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 3, // 3 замість 5
        MANAGER: 2, // 2 замість 1
        EDUCATOR: 0,
        ASSISTANT: 0,
      });

      const res = await service.getTotalProfit();

      expect(res.clubTeachersCount).toBe(3);
      expect(res.managersCount).toBe(2);
      // 3 викладачі * 40 000 грн = 120 000 грн
      expect(res.expenses.clubTeachersSalary.uah).toBe(120000);
      // 2 менеджери * 80 000 грн = 160 000 грн
      expect(res.expenses.managerSalary.uah).toBe(160000);
    });

    test('нараховує базову ставку для вільних помічників якщо assistantsCount > groups.length', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Сонечко',
          educatorId: 1,
          assistantId: 1,
          room: null,
          children: [],
        },
      ]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 3, // 3 помічники на 1 групу -> 2 вільних помічники
      });

      const res = await service.getTotalProfit();

      expect(res.assistantsCount).toBe(3);
      expect(res.groupsCount).toBe(1);
      // 1 помічник у групі (0 дітей: 20 000 грн) + 2 вільних помічники по 20 000 грн = 60 000 грн
      expect(res.expenses.assistantsSalary.uah).toBe(60000);
      expect(res.expenses.assistantsSalary.kopiykas).toBe(6000000);
    });

    test('getTotalProfit: не нараховує зарплату в групі для неактивного помічника та враховує активних як вільних', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Сонечко',
          educatorId: 1,
          educator: { id: 1, isActive: true },
          assistantId: 2,
          assistant: { id: 2, isActive: false }, // Неактивний закріплений помічник
          room: null,
          children: [],
        },
      ]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 1,
        ASSISTANT: 1, // 1 активний помічник у штаті (який не закріплений як активний)
      });

      const res = await service.getTotalProfit();

      // У групі витрати помічника = 0
      expect(res.groups[0].expenses.uah).toBe(50000); // 0 вихователь (0 дітей) + 0 помічник + 50000 оренда
      // Загалом: 0 у групі + 1 вільний помічник * 20 000 = 20 000 грн
      expect(res.expenses.assistantsSalary.uah).toBe(20000);
    });

    test('getTotalProfit: захист Math.max(0, ...) при assistantsCount < assignedActiveAssistantsCount', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Група 1',
          educatorId: 1,
          assistantId: 1,
          room: null,
          children: [],
        },
        {
          id: 2,
          name: 'Група 2',
          educatorId: 2,
          assistantId: 2,
          room: null,
          children: [],
        },
      ]);
      // Наприклад, у БД за Staff лише 1 активний помічник, але в 2 групах закріплені помічники
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 2,
        ASSISTANT: 1,
      });

      const res = await service.getTotalProfit();

      // assignedActiveAssistants = 2, але staffCounts.ASSISTANT = 1 -> freeAssistants = Math.max(0, 1 - 2) = 0
      // 2 * 20 000 грн (по групах) + 0 вільних = 40 000 грн
      expect(res.expenses.assistantsSalary.uah).toBe(40000);
    });

    test('використовує дефолтні значення якщо countActiveStaffByType повертає неповний об’єкт', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([]);
      mockRepo.countActiveStaffByType = jest.fn().mockResolvedValue({
        CLUB_TEACHER: 3,
        // MANAGER, EDUCATOR, ASSISTANT відсутні
      });

      const res = await service.getTotalProfit();

      expect(res.clubTeachersCount).toBe(3);
      expect(res.managersCount).toBe(DEFAULT_MANAGERS_COUNT);
      expect(res.educatorsCount).toBe(0);
      expect(res.assistantsCount).toBe(0);
    });

    test('використовує змінені налаштування з settingsService', async () => {
      mockSettings.get.mockImplementation((key) => {
        if (key === 'MANAGER_SALARY') return 9000000; // 90 000 грн
        if (key === 'CLUB_TEACHER_SALARY') return 5000000; // 50 000 грн
        if (key === 'ROOM_MONTHLY_COST') return 6000000; // 60 000 грн
        if (key === 'DEFAULT_ROOMS_COUNT') return 25; // 25 кімнат
        return DEFAULT_SETTINGS[key];
      });

      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([]);

      const res = await service.getTotalProfit();

      expect(res.expenses.managerSalary.uah).toBe(90000);
      expect(res.expenses.clubTeachersSalary.uah).toBe(250000); // 5 * 50 000
      expect(res.expenses.roomsRent.uah).toBe(1500000); // 25 * 60 000
    });
  });

  describe('calculateOptimalForecast', () => {
    test('успішний розрахунок оптимального прогнозу для вікового попиту з грошовим форматуванням', async () => {
      const demand = { 2: 12, 3: 12, 4: 12, 5: 12 };
      const res = await service.calculateOptimalForecast(demand);

      expect(res.requestedDemand).toBeDefined();
      expect(res.requestedDemand[2]).toBe(12);
      expect(res.requestedDemand.totalChildren).toBe(48);

      // Секція 1: recommended
      expect(res.recommended).toBeDefined();
      expect(res.recommended.groupsCount).toBeGreaterThan(0);
      expect(res.recommended.netProfit).toHaveProperty('uah');
      expect(res.recommended.netProfit).toHaveProperty('kopiykas');
      expect(res.recommended.financials.tuitionIncome).toHaveProperty('uah');
      expect(res.recommended.financials.expenses.totalExpenses).toHaveProperty('uah');
      expect(res.recommended.summary).toContain('Відкрити');

      // Секція 2: strategies (maxProfit, comfortQuality, minimalInfrastructure, admitAll)
      expect(res.strategies).toHaveProperty('maxProfit');
      expect(res.strategies).toHaveProperty('comfortQuality');
      expect(res.strategies).toHaveProperty('minimalInfrastructure');
      expect(res.strategies).toHaveProperty('admitAll');

      expect(res.strategies.maxProfit.financials.tuitionIncome).toHaveProperty('uah');
      expect(res.strategies.maxProfit.financials.expenses.totalExpenses).toHaveProperty('uah');
      expect(res.strategies.minimalInfrastructure.strategyCode).toBe('MINIMAL_INFRASTRUCTURE');
      expect(res.strategies.minimalInfrastructure.netProfit).toHaveProperty('uah');

      // Секція 3: marginalEconomics
      expect(res.marginalEconomics).toBeDefined();
      expect(res.marginalEconomics.marginalChild).toBeDefined();
      expect(res.marginalEconomics.marginalChild.marginalProfit).toHaveProperty('uah');
      expect(res.marginalEconomics.marginalChild.insight).toContain('приносить');

      expect(res.marginalEconomics.clubTeachersStatus).toBeDefined();
      expect(res.marginalEconomics.clubTeachersStatus.insight).toContain('Поточний штат гуртків');

      expect(res.marginalEconomics.expansionAnalysis).toBeDefined();
      expect(res.marginalEconomics.expansionAnalysis.costJump).toHaveProperty('uah');
      expect(res.marginalEconomics.expansionAnalysis.breakdown.roomCost).toHaveProperty('uah');
      expect(res.marginalEconomics.expansionAnalysis.insight).toContain(
        'Відкриття наступної групи'
      );

      expect(res.marginalEconomics.roomsStatus).toBeDefined();
    });

    test('розрахунок для бажаної кількості дітей targetChildrenCount (150 дітей)', async () => {
      const res = await service.calculateOptimalForecast({ targetChildrenCount: 150 });

      expect(res.requestedDemand.totalChildren).toBe(150);
      expect(res.recommended.totalAdmitted).toBe(150);
      expect(res.recommended.groupsCount).toBeGreaterThanOrEqual(8);
      expect(res.strategies.minimalInfrastructure.groupsCount).toBe(8);
      expect(res.strategies.maxProfit.totalAdmitted).toBe(150);
      expect(res.strategies.minimalInfrastructure.totalAdmitted).toBe(150);
    });

    test('розрахунок для нульового попиту (садок без дітей)', async () => {
      const demand = { 2: 0, 3: 0, 4: 0, 5: 0 };
      const res = await service.calculateOptimalForecast(demand);

      expect(res.requestedDemand.totalChildren).toBe(0);
      expect(res.topVariants[0].totalAdmitted).toBe(0);
      expect(res.strategies.maxProfit.totalGroups).toBe(0);
      expect(res.marginalEconomics.roomsStatus.occupiedTotal).toBe(0);
    });

    test('розрахунок з відхиленими дітьми та форматуванням barrierCost у waitlistAdvice', async () => {
      // 1 дитина 2 років - нерентабельно відкривати групу
      const demand = { 2: 1, 3: 0, 4: 0, 5: 0 };
      const res = await service.calculateOptimalForecast(demand);

      expect(res.strategies.maxProfit.totalGroups).toBe(0);
      expect(res.marginalEconomics.waitlistAdvice.length).toBeGreaterThan(0);
      const advice2 = res.marginalEconomics.waitlistAdvice.find((a) => a.age === 2);
      expect(advice2).toBeDefined();
      expect(advice2.rejectedCount).toBe(1);
      if (advice2.barrierCost) {
        expect(advice2.barrierCost).toHaveProperty('uah');
        expect(advice2.barrierCost).toHaveProperty('kopiykas');
      }
    });

    test('підтримує кастомні опції attendanceRate та threshold у запиті', async () => {
      const res = await service.calculateOptimalForecast({
        targetChildrenCount: 24,
        attendanceRate: 0.9,
        threshold: 10,
      });

      expect(res.recommended).toBeDefined();
      expect(res.recommended.totalAdmitted).toBe(24);
    });

    test('без attendanceRate у запиті береться відвідуваність з налаштувань', async () => {
      mockSettings.get.mockImplementation((key) =>
        key === 'ATTENDANCE_RATE_PERCENT' ? 100 : DEFAULT_SETTINGS[key]
      );
      const fromSettings = await service.calculateOptimalForecast({ targetChildrenCount: 24 });

      const explicit = new AnalyticsService(mockRepo, {
        get: jest.fn((key) => DEFAULT_SETTINGS[key]),
      });
      const withQuery = await explicit.calculateOptimalForecast({
        targetChildrenCount: 24,
        attendanceRate: 1,
      });

      expect(fromSettings.recommended.netProfit).toEqual(withQuery.recommended.netProfit);
    });

    test('успішно виконується без аргументів із дефолтним попитом', async () => {
      const res = await service.calculateOptimalForecast();
      expect(res.requestedDemand.totalChildren).toBe(0);
      expect(res.recommended.groupsCount).toBe(0);
    });

    describe('робочі дні з календаря замість сталих 21', () => {
      const withCalendar = (holidays, now) =>
        new AnalyticsService(
          mockRepo,
          { get: jest.fn((key) => (key === 'HOLIDAYS' ? holidays : DEFAULT_SETTINGS[key])) },
          () => now
        );
      const demand = { 2: 20, 3: 20, 4: 20, 5: 20 };

      test('місяць за замовчуванням — поточний за Києвом, свята з налаштувань', async () => {
        // 30.04.2026 22:30 UTC — у Києві вже 1 травня
        const res = await withCalendar(
          ['2026-05-01', '2026-05-08'],
          new Date('2026-04-30T22:30:00Z')
        ).calculateOptimalForecast(demand);
        expect(res.calendar).toEqual({ month: '2026-05', workingDays: 19 });
      });

      test('month у запиті має пріоритет', async () => {
        const res = await withCalendar(
          [],
          new Date('2026-05-15T10:00:00Z')
        ).calculateOptimalForecast({ ...demand, month: '2026-11' });
        expect(res.calendar).toEqual({ month: '2026-11', workingDays: 21 });
      });

      test('нові свята в налаштуваннях зменшують харчування', async () => {
        const now = new Date('2026-08-10T10:00:00Z');
        const without = await withCalendar([], now).calculateOptimalForecast(demand);
        const withHoliday = await withCalendar(['2026-08-24'], now).calculateOptimalForecast(
          demand
        );
        expect(without.calendar.workingDays).toBe(21);
        expect(withHoliday.calendar.workingDays).toBe(20);
        expect(withHoliday.recommended.financials.mealIncome.kopiykas).toBeLessThan(
          without.recommended.financials.mealIncome.kopiykas
        );
      });

      test('поточний момент за замовчуванням — new Date()', () => {
        expect(new AnalyticsService(mockRepo, mockSettings).now()).toBeInstanceOf(Date);
      });
    });
  });

  describe('rates і resolveAttendanceRate', () => {
    test('без запиту відвідуваність — з налаштувань', () => {
      expect(service.resolveAttendanceRate()).toBe(0.8);
    });

    test('річна знижка за замовчуванням 12%, якщо в налаштуваннях її немає', () => {
      mockSettings.get.mockImplementation((key) =>
        key === 'YEARLY_DISCOUNT_PERCENT' ? undefined : DEFAULT_SETTINGS[key]
      );
      expect(service.rates().yearlyDiscountPercent).toBe(12);
    });
  });

  describe('getCalendarForecast: прогноз по місяцях у розрізі віку', () => {
    const kid = (discountPercent = 0) => ({ discountPercent, paymentPlan: 'MONTHLY' });
    const group = (id, age, childrenCount, extra = {}) => ({
      id,
      name: `Група ${id}`,
      age,
      educatorId: id * 10,
      assistantId: id * 10 + 1,
      educator: { id: id * 10, isActive: true },
      assistant: { id: id * 10 + 1, isActive: true },
      room: { id, monthlyCost: 5000000 },
      children: Array.from({ length: childrenCount }, () => kid()),
      _count: { children: childrenCount },
      ...extra,
    });
    // Два групи 3-річних, одна 5-річних, 2- і 4-річних немає
    const GROUPS = [group(1, 3, 14), group(2, 3, 5), group(3, 5, 10)];
    const HOLIDAYS = ['2026-12-25', '2027-01-01'];
    // 10.11.2026 за Києвом
    const NOW = new Date('2026-11-10T10:00:00Z');

    const createCalendarService = (settingsOverrides = {}) => {
      const settings = { ...DEFAULT_SETTINGS, HOLIDAYS, ...settingsOverrides };
      const repo = {
        ...mockRepo,
        findAllGroupsWithActiveChildren: jest.fn().mockResolvedValue(GROUPS),
        countActiveStaffByType: jest.fn().mockResolvedValue({
          CLUB_TEACHER: 5,
          MANAGER: 1,
          EDUCATOR: 3,
          ASSISTANT: 4,
        }),
      };
      return new AnalyticsService(repo, { get: jest.fn((key) => settings[key]) }, () => NOW);
    };

    const sumAges = (month, field) => month.ages.reduce((acc, row) => acc + row[field].kopiykas, 0);

    test('за замовчуванням: 12 місяців із поточного за Києвом', async () => {
      const res = await createCalendarService().getCalendarForecast();
      expect(DEFAULT_FORECAST_MONTHS).toBe(12);
      expect(res).toMatchObject({ from: '2026-11', to: '2027-10', monthsCount: 12 });
      expect(res.months.map((m) => m.month)).toEqual([
        '2026-11',
        '2026-12',
        '2027-01',
        '2027-02',
        '2027-03',
        '2027-04',
        '2027-05',
        '2027-06',
        '2027-07',
        '2027-08',
        '2027-09',
        '2027-10',
      ]);
      expect(res.attendanceRate).toBe(0.8);
      expect(res.assumptions).toBe(FORECAST_ASSUMPTIONS);
    });

    test('рядок для кожного віку 2–5, зокрема без груп', async () => {
      const res = await createCalendarService().getCalendarForecast({ from: '2026-11', months: 1 });
      const [month] = res.months;
      expect(FORECAST_AGES).toEqual([2, 3, 4, 5]);
      expect(month.ages.map((row) => row.age)).toEqual([2, 3, 4, 5]);
      expect(month.ages[0]).toMatchObject({ age: 2, groupsCount: 0, childrenCount: 0 });
      expect(month.ages[0].profit.kopiykas).toBe(0);
      expect(month.ages[1]).toMatchObject({ age: 3, groupsCount: 2, childrenCount: 19 });
      expect(month.ages[3]).toMatchObject({ age: 5, groupsCount: 1, childrenCount: 10 });
      expect(Object.keys(month.ages[1])).toEqual([
        'age',
        'groupsCount',
        'childrenCount',
        'tuition',
        'meal',
        'income',
        'educatorSalary',
        'assistantSalary',
        'roomsRent',
        'expenses',
        'profit',
      ]);
    });

    test('профіт віку = сума профітів його груп за GET /groups/:id/profit', async () => {
      const service = createCalendarService();
      const res = await service.getCalendarForecast({ from: '2026-11', months: 1 });
      service.repository.findGroupById = jest.fn((id) =>
        Promise.resolve(GROUPS.find((g) => g.id === id))
      );
      const [g1, g2] = await Promise.all([service.getGroupProfit(1), service.getGroupProfit(2)]);
      expect(res.months[0].ages[1].profit.kopiykas).toBe(g1.profit.kopiykas + g2.profit.kopiykas);
      expect(res.months[0].ages[1].meal.kopiykas).toBe(
        g1.mealIncome.kopiykas + g2.mealIncome.kopiykas
      );
    });

    test('інваріант: сума профітів віків − спільні витрати = профіт садка, щомісяця', async () => {
      const res = await createCalendarService().getCalendarForecast({ from: '2026-11', months: 3 });
      for (const month of res.months) {
        expect(sumAges(month, 'profit') - month.shared.total.kopiykas).toBe(
          month.total.profit.kopiykas
        );
        expect(sumAges(month, 'income')).toBe(month.total.income.kopiykas);
        expect(sumAges(month, 'expenses') + month.shared.total.kopiykas).toBe(
          month.total.expenses.kopiykas
        );
      }
      const profits = res.months.reduce((acc, m) => acc + m.total.profit.kopiykas, 0);
      expect(res.summary.profit.kopiykas).toBe(profits);
    });

    test('спільні витрати: гуртки, їхні кабінети, менеджер, помічник без групи, простій', async () => {
      const res = await createCalendarService().getCalendarForecast({ from: '2026-11', months: 1 });
      const { shared } = res.months[0];
      expect(shared.clubTeachersSalary.kopiykas).toBe(5 * 4000000);
      expect(shared.clubRoomsRent.kopiykas).toBe(5 * 5000000);
      expect(shared.managerSalary.kopiykas).toBe(8000000);
      expect(shared.unassignedAssistantsSalary.kopiykas).toBe(2000000); // 4 у штаті, 3 у групах
      expect(shared.idleRoomsRent.kopiykas).toBe(12 * 5000000); // 20 − 3 групи − 5 кабінетів
      expect(shared.total.kopiykas).toBe(20000000 + 25000000 + 8000000 + 2000000 + 60000000);
    });

    test('місяць із 21 робочим днем збігається з GET /profit', async () => {
      const service = createCalendarService();
      const res = await service.getCalendarForecast({ from: '2026-11', months: 1 });
      const total = await service.getTotalProfit();
      expect(res.months[0].workingDays).toBe(21);
      expect(res.months[0].total.profit).toEqual(total.profit);
      expect(res.months[0].total.income).toEqual(total.income.total);
      expect(res.months[0].total.expenses).toEqual(total.expenses.total);
    });

    test('різні робочі дні — різне харчування; навчання й зарплати сталі', async () => {
      const res = await createCalendarService().getCalendarForecast({ from: '2026-11', months: 3 });
      const [nov, dec, jan] = res.months;
      expect([nov.workingDays, dec.workingDays, jan.workingDays]).toEqual([21, 22, 20]);
      expect(sumAges(dec, 'meal')).toBeGreaterThan(sumAges(nov, 'meal'));
      expect(sumAges(jan, 'meal')).toBeLessThan(sumAges(nov, 'meal'));
      expect(sumAges(dec, 'tuition')).toBe(sumAges(nov, 'tuition'));
      expect(sumAges(dec, 'educatorSalary')).toBe(sumAges(nov, 'educatorSalary'));
      // 3 роки: 400 грн × 22 × 0,8 = 7 040 грн на дитину × 19
      expect(dec.ages[1].meal.kopiykas).toBe(19 * Math.round(40000 * 22 * 0.8));
    });

    test('свята беруться з налаштувань: нове свято зменшує робочі дні', async () => {
      const before = await createCalendarService({ HOLIDAYS: [] }).getCalendarForecast({
        from: '2026-12',
        months: 1,
      });
      const after = await createCalendarService({ HOLIDAYS: ['2026-12-25'] }).getCalendarForecast({
        from: '2026-12',
        months: 1,
      });
      expect(before.months[0].workingDays).toBe(23);
      expect(after.months[0].workingDays).toBe(22);
    });

    test('рік без свят у налаштуваннях — окреме припущення у відповіді', async () => {
      const res = await createCalendarService().getCalendarForecast({ from: '2027-12', months: 2 });
      expect(res.assumptions).toEqual([
        ...FORECAST_ASSUMPTIONS,
        'Свят на 2028 рік у налаштуваннях немає: робочі дні — лише Пн–Пт',
      ]);
      expect(res.months[1]).toMatchObject({ month: '2028-01', workingDays: 21 });
    });

    test('attendanceRate із запиту перекриває налаштування', async () => {
      const res = await createCalendarService().getCalendarForecast({
        from: '2026-11',
        months: 1,
        attendanceRate: 1,
      });
      expect(res.attendanceRate).toBe(1);
      expect(res.months[0].ages[3].meal.kopiykas).toBe(10 * 60000 * 21);
    });

    test('садок без груп: вікові рядки нульові, профіт = −спільні витрати', async () => {
      const service = createCalendarService();
      service.repository.findAllGroupsWithActiveChildren.mockResolvedValue([]);
      const res = await service.getCalendarForecast({ from: '2026-11', months: 1 });
      expect(res.months[0].ages.every((row) => row.groupsCount === 0)).toBe(true);
      expect(res.months[0].total.profit.kopiykas).toBe(-res.months[0].shared.total.kopiykas);
    });
  });

  describe('formatVariantFinancials & formatOptimalForecastMoney helpers', () => {
    test('formatVariantFinancials повертає null якщо передано null або undefined', () => {
      expect(formatVariantFinancials(null)).toBeNull();
      expect(formatVariantFinancials(undefined)).toBeNull();
    });

    test('formatVariantFinancials коректно форматує об’єкт без ageBreakdown', () => {
      const cfg = {
        totalGroups: 2,
        netProfit: 1000000,
        tuitionIncome: 3000000,
        mealIncome: 500000,
        totalIncome: 3500000,
        totalRoomsRent: 1000000,
        totalAssistantsSalary: 400000,
        totalEducatorsSalary: 400000,
        totalClubTeachersSalary: 200000,
        totalManagerSalary: 80000,
        totalStaffSalaries: 1080000,
        totalExpenses: 2080000,
      };
      const formatted = formatVariantFinancials(cfg);
      expect(formatted.groupsCount).toBe(2);
      expect(formatted.netProfit.uah).toBe(10000);
      expect(formatted.financials.tuitionIncome.uah).toBe(30000);
      expect(formatted.profitDifference).toBeUndefined();
    });

    test('formatOptimalForecastMoney коректно обробляє пустий або частковий результат', () => {
      const raw = {
        requestedDemand: { 2: 0, 3: 0, 4: 0, 5: 0, totalChildren: 0 },
      };
      const res = formatOptimalForecastMoney(raw);
      expect(res.recommended).toBeNull();
      expect(res.topVariants).toEqual([]);
      expect(res.strategies).toEqual({});
      expect(res.marginalEconomics.marginalChild).toBeNull();
      expect(res.marginalEconomics.expansionAnalysis).toBeNull();
      expect(res.marginalEconomics.waitlistAdvice).toEqual([]);
    });
  });
});
