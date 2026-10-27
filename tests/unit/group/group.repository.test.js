const {
  GroupsRepository,
  groupsRepository,
  GROUP_SUMMARY_SELECT,
  GROUP_DETAILS_SELECT,
} = require('../../../src/modules/groups/groups.repository');

const TAUGHT_BY_9 = { OR: [{ educator: { userId: 9 } }, { assistant: { userId: 9 } }] };

function createRepository({ enrolled = 0 } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 2 }]),
    child: {
      count: jest.fn().mockResolvedValue(enrolled),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const db = {
    group: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(3),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      delete: jest.fn().mockResolvedValue({ id: 1 }),
    },
    child: {
      count: jest.fn().mockResolvedValue(4),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    room: { findUnique: jest.fn().mockResolvedValue(null) },
    staff: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { db, tx, repository: new GroupsRepository(db) };
}

describe('GroupsRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(groupsRepository).toBeInstanceOf(GroupsRepository);
  });

  test('findMany: без фільтрів і з фільтром віку та вихователя', async () => {
    const { db, repository } = createRepository();
    await repository.findMany();
    expect(db.group.findMany).toHaveBeenCalledWith({
      where: { age: undefined },
      select: GROUP_SUMMARY_SELECT,
      orderBy: { id: 'asc' },
    });
    await repository.findMany({ age: 4, staffUserId: 9 });
    expect(db.group.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { age: 4, ...TAUGHT_BY_9 } })
    );
  });

  test('findById: з умовою на персонал і без', async () => {
    const { db, repository } = createRepository();
    await repository.findById(2);
    expect(db.group.findFirst).toHaveBeenCalledWith({
      where: { id: 2 },
      select: GROUP_DETAILS_SELECT,
    });
    await repository.findById(2, 9);
    expect(db.group.findFirst).toHaveBeenLastCalledWith({
      where: { id: 2, ...TAUGHT_BY_9 },
      select: GROUP_DETAILS_SELECT,
    });
  });

  test('кількість дітей рахується лише за активними', async () => {
    const { db, repository } = createRepository();
    await expect(repository.countActiveChildren(2)).resolves.toBe(4);
    expect(db.child.count).toHaveBeenCalledWith({ where: { groupId: 2, isActive: true } });
    expect(GROUP_SUMMARY_SELECT._count).toEqual({
      select: { children: { where: { isActive: true } } },
    });
  });

  test('прості запити: findRawById, count, findRoom, findStaff, findChild', async () => {
    const { db, repository } = createRepository();
    await repository.findRawById(2);
    expect(db.group.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
    await expect(repository.count()).resolves.toBe(3);
    await repository.findRoom(6);
    expect(db.room.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 6 } }));
    await repository.findStaff(1);
    expect(db.staff.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
    await repository.findChild(5);
    expect(db.child.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
  });

  test('create, update, delete', async () => {
    const { db, repository } = createRepository();
    await repository.create({ name: 'А', age: 3, roomId: 6 });
    expect(db.group.create).toHaveBeenCalledWith({
      data: { name: 'А', age: 3, roomId: 6 },
      select: GROUP_SUMMARY_SELECT,
    });
    await repository.update(2, { educatorId: null });
    expect(db.group.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { educatorId: null },
      select: GROUP_SUMMARY_SELECT,
    });
    await expect(repository.delete(2)).resolves.toBeUndefined();
    expect(db.group.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  describe('enrollChildIfCapacity', () => {
    test('є місце: блокує групу, рахує активних дітей і зараховує', async () => {
      const { db, tx, repository } = createRepository({ enrolled: 19 });
      await expect(repository.enrollChildIfCapacity(2, 5, 20)).resolves.toBe(true);
      expect(db.$transaction).toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.child.count).toHaveBeenCalledWith({ where: { groupId: 2, isActive: true } });
      expect(tx.child.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { groupId: 2 } });
    });

    test('група заповнена: дитину не зараховано', async () => {
      const { tx, repository } = createRepository({ enrolled: 20 });
      await expect(repository.enrollChildIfCapacity(2, 5, 20)).resolves.toBe(false);
      expect(tx.child.update).not.toHaveBeenCalled();
    });
  });

  test('unenrollChild знімає дитину з групи', async () => {
    const { db, repository } = createRepository();
    await expect(repository.unenrollChild(5)).resolves.toBeUndefined();
    expect(db.child.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { groupId: null } });
  });
});
