const {
  AbsencesRepository,
  absencesRepository,
  ABSENCE_SELECT,
} = require('../../../src/modules/absences/absences.repository');

function createRepository() {
  const db = {
    absence: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
  return { db, repository: new AbsencesRepository(db) };
}

const RANGE = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };

describe('AbsencesRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(absencesRepository).toBeInstanceOf(AbsencesRepository);
  });

  test('create: дата як Date для поля @db.Date', async () => {
    const { db, repository } = createRepository();
    const notifiedAt = new Date('2026-11-09T06:00:00Z');
    await repository.create({ childId: 5, date: '2026-11-12', notifiedAt });
    expect(db.absence.create).toHaveBeenCalledWith({
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

  test('delete нічого не повертає', async () => {
    const { db, repository } = createRepository();
    await expect(repository.delete(7)).resolves.toBeUndefined();
    expect(db.absence.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});
