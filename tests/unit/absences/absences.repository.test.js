const {
  AbsencesRepository,
  absencesRepository,
  ABSENCE_SELECT,
} = require('../../../src/modules/absences/absences.repository');

// Записи йдуть через withActor: транзакція, у якій спершу ставиться app.actor_id
function createRepository() {
  const absence = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const tx = { absence, $executeRaw: jest.fn().mockResolvedValue(1) };
  const db = { absence, $transaction: jest.fn(async (fn) => fn(tx)) };
  return { db, tx, repository: new AbsencesRepository(db) };
}

const actorOf = (tx) => tx.$executeRaw.mock.calls[0][1];

const RANGE = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };

describe('AbsencesRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(absencesRepository).toBeInstanceOf(AbsencesRepository);
  });

  test('create: дата як Date для поля @db.Date; запис від імені користувача', async () => {
    const { db, tx, repository } = createRepository();
    const notifiedAt = new Date('2026-11-09T06:00:00Z');
    await expect(
      repository.create({ childId: 5, date: '2026-11-12', notifiedAt }, 16)
    ).resolves.toEqual({ id: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(actorOf(tx)).toBe('16');
    expect(tx.absence.create).toHaveBeenCalledWith({
      data: { childId: 5, date: new Date('2026-11-12T00:00:00Z'), notifiedAt },
      select: ABSENCE_SELECT,
    });
  });

  test('findByChild: межі [from, to), за датою', async () => {
    const { db, repository } = createRepository();
    await repository.findByChild(5, RANGE);
    expect(db.absence.findMany).toHaveBeenCalledWith({
      where: { childId: 5, date: { gte: RANGE.from, lt: RANGE.to } },
      select: ABSENCE_SELECT,
      orderBy: { date: 'asc' },
    });
  });

  test('findById', async () => {
    const { db, repository } = createRepository();
    await expect(repository.findById(7)).resolves.toBeNull();
    expect(db.absence.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: ABSENCE_SELECT,
    });
  });

  test('delete від імені користувача, нічого не повертає', async () => {
    const { db, tx, repository } = createRepository();
    await expect(repository.delete(7, 16)).resolves.toBeUndefined();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(actorOf(tx)).toBe('16');
    expect(tx.absence.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});
