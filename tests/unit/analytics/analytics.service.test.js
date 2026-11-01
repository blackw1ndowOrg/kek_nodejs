const {
  AnalyticsService,
  analyticsService,
  toMoney,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  DEFAULT_TOTAL_ROOMS_COUNT,
} = require('../../../src/modules/analytics/analytics.service');
const { NotFoundError } = require('../../../src/errors/AppError');

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
  };

  beforeEach(() => {
    mockRepo = {
      findGroupById: jest.fn(),
      findAllActiveChildren: jest.fn(),
      findAllGroupsWithActiveChildren: jest.fn(),
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
        hryvnias: 15000,
        kopecks: 1500000,
        kopiykas: 1500000,
      });
    });

    test('конвертує 0 копійок', () => {
      const money = toMoney(0);
      expect(money).toEqual({
        uah: 0,
        hryvnias: 0,
        kopecks: 0,
        kopiykas: 0,
      });
    });

    test('конвертує від’ємну суму в копійках', () => {
      const money = toMoney(-7000000);
      expect(money).toEqual({
        uah: -70000,
        hryvnias: -70000,
        kopecks: -7000000,
        kopiykas: -7000000,
      });
    });
  });

  describe('getGroupProfit', () => {
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

    test('розраховує профіт для групи з 15 дітьми та різними пільгами', async () => {
      // 10 дітей без пільги: 10 * 15 000 = 150 000 грн (15 000 000 коп)
      // 3 дітей з пільгою 10%: 3 * 13 500 = 40 500 грн (4 050 000 коп)
      // 2 дітей з пільгою 20%: 2 * 12 000 = 24 000 грн (2 400 000 коп)
      // Всього дохід: 214 500 грн (21 450 000 коп)
      const children = [
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, fullName: `Дитина ${i + 1}`, discountPercent: 0 })),
        ...Array.from({ length: 3 }, (_, i) => ({ id: i + 11, fullName: `Дитина ${i + 11}`, discountPercent: 10 })),
        ...Array.from({ length: 2 }, (_, i) => ({ id: i + 14, fullName: `Дитина ${i + 14}`, discountPercent: 20 })),
      ];

      mockRepo.findGroupById.mockResolvedValue({
        id: 2,
        name: 'Чомусики',
        roomId: 12,
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
          room: { id: 1, monthlyCost: 5000000 },
          children: activeChildren.filter((c) => c.groupId === 1),
          _count: { children: 10 },
        },
        {
          id: 2,
          name: 'Дзвіночок',
          room: { id: 2, monthlyCost: 5000000 },
          children: activeChildren.filter((c) => c.groupId === 2),
          _count: { children: 14 },
        },
      ];

      mockRepo.findAllActiveChildren.mockResolvedValue(activeChildren);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue(groups);

      const res = await service.getTotalProfit();

      expect(res.activeChildrenCount).toBe(25);
      expect(res.groupsCount).toBe(2);

      // Дохід
      expect(res.income.tuition.uah).toBe(360000);
      expect(res.income.tuition.kopiykas).toBe(36000000);

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

      // Чистий профіт: 360 000 - 1 380 000 = -1 020 000 грн (-102 000 000 коп)
      expect(res.profit.uah).toBe(-1020000);
      expect(res.profit.kopiykas).toBe(-102000000);

      // Перевірка списку груп groups
      expect(res.groups).toHaveLength(2);
      expect(res.groups[0]).toEqual({
        groupId: 1,
        groupName: 'Сонечко',
        childrenCount: 10,
        income: toMoney(15000000),
        expenses: toMoney(9000000), // 20k + 20k + 50k = 90k
        profit: toMoney(6000000), // 150k - 90k = 60k
      });
    });

    test('getTotalProfit використовує defaultRoomCost якщо кімната в групі не задана', async () => {
      mockRepo.findAllActiveChildren.mockResolvedValue([]);
      mockRepo.findAllGroupsWithActiveChildren.mockResolvedValue([
        {
          id: 1,
          name: 'Без кімнати',
          room: null,
          children: [],
        },
      ]);
      const res = await service.getTotalProfit();
      expect(res.groups[0].expenses.uah).toBe(70000); // 0 + 20000 + 50000
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
});
