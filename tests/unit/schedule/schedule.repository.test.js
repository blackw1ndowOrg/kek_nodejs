const {
  ScheduleRepository,
  scheduleRepository,
  SLOT_FIELDS,
  SLOT_SELECT,
} = require('../../../src/modules/schedule/schedule.repository');

const TAUGHT_BY_9 = { OR: [{ educator: { userId: 9 } }, { assistant: { userId: 9 } }] };
const ORDER = [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }, { groupId: 'asc' }];

function createRepository() {
  const tx = {
    scheduleSlot: {
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      createMany: jest.fn().mockResolvedValue({ count: 260 }),
    },
  };
  const db = {
    group: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    club: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    scheduleSlot: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 65 }),
    },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { db, tx, repository: new ScheduleRepository(db) };
}

describe('ScheduleRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(scheduleRepository).toBeInstanceOf(ScheduleRepository);
  });

  test('SLOT_SELECT додає гурток до полів слота', () => {
    expect(SLOT_SELECT).toEqual({ ...SLOT_FIELDS, club: { select: { id: true, name: true } } });
    expect(SLOT_FIELDS).toEqual({
      id: true,
      groupId: true,
      dayOfWeek: true,
      startMinute: true,
      endMinute: true,
      activity: true,
      clubId: true,
    });
  });

  test('findGroups і findClubs: лише id за зростанням', async () => {
    const { db, repository } = createRepository();
    await repository.findGroups();
    expect(db.group.findMany).toHaveBeenCalledWith({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    await repository.findClubs();
    expect(db.club.findMany).toHaveBeenCalledWith({ select: { id: true }, orderBy: { id: 'asc' } });
  });

  describe('replaceAll', () => {
    test('в одній транзакції спершу видаляє всі слоти, потім створює нові', async () => {
      const { db, tx, repository } = createRepository();
      const slots = [{ groupId: 1 }];
      await expect(repository.replaceAll(slots)).resolves.toBe(260);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.scheduleSlot.deleteMany).toHaveBeenCalledWith();
      expect(tx.scheduleSlot.createMany).toHaveBeenCalledWith({ data: slots });
      expect(tx.scheduleSlot.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.scheduleSlot.createMany.mock.invocationCallOrder[0]
      );
    });

    test('помилка створення прокидається', async () => {
      const { tx, repository } = createRepository();
      const error = new Error('db down');
      tx.scheduleSlot.createMany.mockRejectedValueOnce(error);
      await expect(repository.replaceAll([])).rejects.toBe(error);
    });
  });

  describe('findAccessibleGroup', () => {
    const select = { id: true, name: true, age: true };

    test.each(['ADMIN', 'MANAGER'])('%s бачить будь-яку групу', async (role) => {
      const { db, repository } = createRepository();
      await repository.findAccessibleGroup(2, { id: 1, role });
      expect(db.group.findFirst).toHaveBeenCalledWith({ where: { id: 2 }, select });
    });

    test('вихователь: лише групи, де він вихователь або помічник', async () => {
      const { db, repository } = createRepository();
      await repository.findAccessibleGroup(2, { id: 9, role: 'TEACHER' });
      expect(db.group.findFirst).toHaveBeenCalledWith({
        where: { id: 2, ...TAUGHT_BY_9 },
        select,
      });
    });

    test('батько: лише групи своїх дітей', async () => {
      const { db, repository } = createRepository();
      await repository.findAccessibleGroup(2, { id: 9, role: 'PARENT' });
      expect(db.group.findFirst).toHaveBeenCalledWith({
        where: {
          id: 2,
          children: { some: { parents: { some: { parent: { userId: 9 } } } } },
        },
        select,
      });
    });
  });

  test('findGroupSlots: слоти групи в порядку розкладу', async () => {
    const { db, repository } = createRepository();
    await repository.findGroupSlots(2);
    expect(db.scheduleSlot.findMany).toHaveBeenCalledWith({
      where: { groupId: 2 },
      orderBy: ORDER,
      select: SLOT_SELECT,
    });
  });

  test('findTeacherSlots: слоти груп викладача й занять його гуртка', async () => {
    const { db, repository } = createRepository();
    await repository.findTeacherSlots(9);
    expect(db.scheduleSlot.findMany).toHaveBeenCalledWith({
      where: { OR: [{ group: TAUGHT_BY_9 }, { club: { teacher: { userId: 9 } } }] },
      orderBy: ORDER,
      select: { ...SLOT_SELECT, group: { select: { id: true, name: true } } },
    });
  });

  test('findSlot і findClub', async () => {
    const { db, repository } = createRepository();
    await repository.findSlot(7);
    expect(db.scheduleSlot.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: SLOT_FIELDS,
    });
    await repository.findClub(3);
    expect(db.club.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, select: { id: true } });
  });

  describe('findRelatedSlots', () => {
    test('з гуртком: слоти групи й слоти гуртка', async () => {
      const { db, repository } = createRepository();
      await repository.findRelatedSlots(2, 11);
      expect(db.scheduleSlot.findMany).toHaveBeenCalledWith({
        where: { OR: [{ groupId: 2 }, { clubId: 11 }] },
        select: SLOT_FIELDS,
      });
    });

    test.each([null, undefined])('без гуртка (%p): лише слоти групи', async (clubId) => {
      const { db, repository } = createRepository();
      await repository.findRelatedSlots(2, clubId);
      expect(db.scheduleSlot.findMany).toHaveBeenCalledWith({
        where: { OR: [{ groupId: 2 }] },
        select: SLOT_FIELDS,
      });
    });
  });

  test('updateSlot', async () => {
    const { db, repository } = createRepository();
    await repository.updateSlot(7, { startMinute: 600 });
    expect(db.scheduleSlot.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { startMinute: 600 },
      select: SLOT_SELECT,
    });
  });

  test('deleteByGroup повертає кількість видалених слотів', async () => {
    const { db, repository } = createRepository();
    await expect(repository.deleteByGroup(2)).resolves.toBe(65);
    expect(db.scheduleSlot.deleteMany).toHaveBeenCalledWith({ where: { groupId: 2 } });
  });
});
