const {
  AnalyticsRepository,
  analyticsRepository,
} = require('../../../src/modules/analytics/analytics.repository');

describe('AnalyticsRepository', () => {
  let mockDb;
  let repo;

  beforeEach(() => {
    mockDb = {
      group: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      child: {
        findMany: jest.fn(),
      },
      staff: {
        groupBy: jest.fn(),
      },
    };
    repo = new AnalyticsRepository(mockDb);
  });

  test('експортує дефолтний екземпляр analyticsRepository', () => {
    expect(analyticsRepository).toBeInstanceOf(AnalyticsRepository);
  });

  describe('findGroupById', () => {
    test('викликає group.findUnique з потрібними параметрами та зв’язками', async () => {
      const mockGroup = {
        id: 1,
        name: 'Сонечко',
        room: { id: 10, name: 'Кімната 1', monthlyCost: 5000000 },
        children: [{ id: 5, fullName: 'Іван', discountPercent: 10 }],
      };
      mockDb.group.findUnique.mockResolvedValue(mockGroup);

      const result = await repo.findGroupById(1);

      expect(mockDb.group.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.objectContaining({
          id: true,
          name: true,
          age: true,
          roomId: true,
          room: expect.any(Object),
          children: expect.objectContaining({
            where: { isActive: true },
          }),
        }),
      });
      expect(result).toEqual(mockGroup);
    });
  });

  describe('findAllActiveChildren', () => {
    test('викликає child.findMany з умовою isActive: true', async () => {
      const mockChildren = [
        { id: 1, fullName: 'Марія', discountPercent: 0, groupId: 1 },
        { id: 2, fullName: 'Петро', discountPercent: 20, groupId: 2 },
      ];
      mockDb.child.findMany.mockResolvedValue(mockChildren);

      const result = await repo.findAllActiveChildren();

      expect(mockDb.child.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: {
          id: true,
          fullName: true,
          discountPercent: true,
          groupId: true,
        },
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual(mockChildren);
    });
  });

  describe('findAllGroupsWithActiveChildren', () => {
    test('викликає group.findMany із включенням кімнати та активних дітей', async () => {
      const mockGroups = [
        {
          id: 1,
          name: 'Сонечко',
          room: { id: 1, monthlyCost: 5000000 },
          children: [{ id: 1, discountPercent: 0 }],
          _count: { children: 1 },
        },
      ];
      mockDb.group.findMany.mockResolvedValue(mockGroups);

      const result = await repo.findAllGroupsWithActiveChildren();

      expect(mockDb.group.findMany).toHaveBeenCalledWith({
        select: expect.objectContaining({
          id: true,
          name: true,
          room: expect.any(Object),
          children: expect.objectContaining({
            where: { isActive: true },
          }),
          _count: expect.any(Object),
        }),
        orderBy: { id: 'asc' },
      });
      expect(result).toEqual(mockGroups);
    });
  });

  describe('countActiveStaffByType', () => {
    test('викликає staff.groupBy з умовою isActive: true та мапить результат за типами', async () => {
      mockDb.staff.groupBy.mockResolvedValue([
        { type: 'CLUB_TEACHER', _count: { id: 5 } },
        { type: 'MANAGER', _count: { id: 1 } },
        { type: 'EDUCATOR', _count: { id: 4 } },
        { type: 'ASSISTANT', _count: { id: 4 } },
      ]);

      const result = await repo.countActiveStaffByType();

      expect(mockDb.staff.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: { isActive: true },
        _count: { id: true },
      });
      expect(result).toEqual({
        CLUB_TEACHER: 5,
        MANAGER: 1,
        EDUCATOR: 4,
        ASSISTANT: 4,
      });
    });

    test('повертає нулі для типів, яких немає в результаті groupBy та ігнорує сторонні типи', async () => {
      mockDb.staff.groupBy.mockResolvedValue([
        { type: 'CLUB_TEACHER', _count: { id: 2 } },
        { type: 'CLEANER', _count: { id: 5 } },
      ]);

      const result = await repo.countActiveStaffByType();

      expect(result).toEqual({
        CLUB_TEACHER: 2,
        MANAGER: 0,
        EDUCATOR: 0,
        ASSISTANT: 0,
      });
    });

    test('прокидає помилку бази даних далі без мовчазного приглушення', async () => {
      mockDb.staff.groupBy.mockRejectedValue(new Error('DB connection failed'));

      await expect(repo.countActiveStaffByType()).rejects.toThrow('DB connection failed');
    });
  });
});
