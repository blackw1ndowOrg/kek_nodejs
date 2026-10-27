const {
  RoomsRepository,
  roomsRepository,
} = require('../../../src/modules/rooms/rooms.repository');

const ROOM_SELECT = {
  id: true,
  name: true,
  type: true,
  monthlyCost: true,
  group: { select: { id: true, name: true } },
  club: { select: { id: true, name: true } },
};

function createRepository() {
  const db = {
    room: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(7),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      delete: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
  return { db, repository: new RoomsRepository(db) };
}

describe('RoomsRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(roomsRepository).toBeInstanceOf(RoomsRepository);
  });

  describe('findMany', () => {
    test('без аргументів: без фільтра', async () => {
      const { db, repository } = createRepository();
      await repository.findMany();
      expect(db.room.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { id: 'asc' },
        select: ROOM_SELECT,
      });
    });

    test('з порожнім фільтром: без where', async () => {
      const { db, repository } = createRepository();
      await repository.findMany({});
      expect(db.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });

    test('з типом: фільтр за type', async () => {
      const { db, repository } = createRepository();
      await repository.findMany({ type: 'CLUB' });
      expect(db.room.findMany).toHaveBeenCalledWith({
        where: { type: 'CLUB' },
        orderBy: { id: 'asc' },
        select: ROOM_SELECT,
      });
    });

    test('повертає результат бази', async () => {
      const { db, repository } = createRepository();
      const rooms = [{ id: 1 }, { id: 2 }];
      db.room.findMany.mockResolvedValueOnce(rooms);
      await expect(repository.findMany()).resolves.toBe(rooms);
    });
  });

  test('count', async () => {
    const { db, repository } = createRepository();
    await expect(repository.count()).resolves.toBe(7);
    expect(db.room.count).toHaveBeenCalledWith();
  });

  test('findById: шукає за id з потрібним select', async () => {
    const { db, repository } = createRepository();
    await expect(repository.findById(3)).resolves.toBeNull();
    expect(db.room.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, select: ROOM_SELECT });
  });

  test('create', async () => {
    const { db, repository } = createRepository();
    const data = { name: 'А', type: 'GROUP', monthlyCost: 1000 };
    await expect(repository.create(data)).resolves.toEqual({ id: 1 });
    expect(db.room.create).toHaveBeenCalledWith({ data, select: ROOM_SELECT });
  });

  test('update', async () => {
    const { db, repository } = createRepository();
    await repository.update(2, { name: 'Б' });
    expect(db.room.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { name: 'Б' },
      select: ROOM_SELECT,
    });
  });

  test('delete', async () => {
    const { db, repository } = createRepository();
    await repository.delete(2);
    expect(db.room.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  test('помилка бази прокидається', async () => {
    const { db, repository } = createRepository();
    const error = new Error('db down');
    db.room.count.mockRejectedValueOnce(error);
    await expect(repository.count()).rejects.toBe(error);
  });
});
