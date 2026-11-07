const {
  ClubsRepository,
  clubsRepository,
  CLUB_SELECT,
} = require('../../../src/modules/clubs/clubs.repository');

function createRepository() {
  const tx = {
    scheduleSlot: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    club: { delete: jest.fn().mockResolvedValue({ id: 4 }) },
  };
  const db = {
    club: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    room: { findUnique: jest.fn().mockResolvedValue(null) },
    staff: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { db, tx, repository: new ClubsRepository(db) };
}

describe('ClubsRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(clubsRepository).toBeInstanceOf(ClubsRepository);
  });

  test('CLUB_SELECT повертає кімнату й викладача', () => {
    expect(CLUB_SELECT).toEqual({
      id: true,
      name: true,
      room: { select: { id: true, name: true, type: true } },
      teacher: { select: { id: true, fullName: true } },
    });
  });

  test('findMany: за зростанням id', async () => {
    const { db, repository } = createRepository();
    const clubs = [{ id: 1 }];
    db.club.findMany.mockResolvedValueOnce(clubs);
    await expect(repository.findMany()).resolves.toBe(clubs);
    expect(db.club.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      select: CLUB_SELECT,
    });
  });

  test('findById', async () => {
    const { db, repository } = createRepository();
    await expect(repository.findById(4)).resolves.toBeNull();
    expect(db.club.findUnique).toHaveBeenCalledWith({ where: { id: 4 }, select: CLUB_SELECT });
  });

  test('findRoom: з групою та гуртком, що займають кімнату', async () => {
    const { db, repository } = createRepository();
    await repository.findRoom(6);
    expect(db.room.findUnique).toHaveBeenCalledWith({
      where: { id: 6 },
      select: {
        id: true,
        type: true,
        group: { select: { id: true } },
        club: { select: { id: true } },
      },
    });
  });

  test('findStaff: з гуртком, який веде працівник', async () => {
    const { db, repository } = createRepository();
    await repository.findStaff(12);
    expect(db.staff.findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: { id: true, type: true, isActive: true, clubTaught: { select: { id: true } } },
    });
  });

  test('create і update', async () => {
    const { db, repository } = createRepository();
    const data = { name: 'Музика', roomId: 6, teacherId: 12 };
    await repository.create(data);
    expect(db.club.create).toHaveBeenCalledWith({ data, select: CLUB_SELECT });
    await repository.update(4, { name: 'Шахи' });
    expect(db.club.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { name: 'Шахи' },
      select: CLUB_SELECT,
    });
  });

  describe('delete', () => {
    test('у транзакції спершу оновлює слоти розкладу гуртка на FREE_PLAY, потім видаляє сам гурток', async () => {
      const { db, tx, repository } = createRepository();
      await expect(repository.delete(4)).resolves.toBeUndefined();
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.scheduleSlot.updateMany).toHaveBeenCalledWith({
        where: { clubId: 4 },
        data: { activity: 'FREE_PLAY', clubId: null },
      });
      expect(tx.club.delete).toHaveBeenCalledWith({ where: { id: 4 } });
      expect(tx.scheduleSlot.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.club.delete.mock.invocationCallOrder[0]
      );
    });

    test('помилка видалення гуртка прокидається', async () => {
      const { tx, repository } = createRepository();
      const error = new Error('db down');
      tx.club.delete.mockRejectedValueOnce(error);
      await expect(repository.delete(4)).rejects.toBe(error);
    });
  });
});
