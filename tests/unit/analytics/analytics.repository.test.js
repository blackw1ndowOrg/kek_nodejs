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
});
