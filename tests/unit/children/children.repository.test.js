const {
  ChildrenRepository,
  childrenRepository,
  CHILD_SELECT,
} = require('../../../src/modules/children/children.repository');

const OWNED_BY_PARENT_12 = { parents: { some: { parent: { userId: 12 } } } };

function createRepository() {
  const db = {
    child: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    parent: { count: jest.fn().mockResolvedValue(2) },
  };
  return { db, repository: new ChildrenRepository(db) };
}

describe('ChildrenRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(childrenRepository).toBeInstanceOf(ChildrenRepository);
  });

  describe('findMany', () => {
    test('без фільтрів', async () => {
      const { db, repository } = createRepository();
      await repository.findMany();
      expect(db.child.findMany).toHaveBeenCalledWith({
        where: { groupId: undefined, isActive: undefined },
        select: CHILD_SELECT,
        orderBy: { id: 'asc' },
      });
    });

    test('фільтри групи, активності й батька', async () => {
      const { db, repository } = createRepository();
      await repository.findMany({ groupId: 3, isActive: false, parentUserId: 12 });
      expect(db.child.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 3, isActive: false, ...OWNED_BY_PARENT_12 },
        })
      );
    });
  });

  describe('findById', () => {
    test('без батька — лише за id', async () => {
      const { db, repository } = createRepository();
      db.child.findFirst.mockResolvedValueOnce({ id: 5 });
      await expect(repository.findById(5)).resolves.toEqual({ id: 5 });
      expect(db.child.findFirst).toHaveBeenCalledWith({ where: { id: 5 }, select: CHILD_SELECT });
    });

    test('з батьком — додається умова на ParentChild', async () => {
      const { db, repository } = createRepository();
      await expect(repository.findById(5, 12)).resolves.toBeNull();
      expect(db.child.findFirst).toHaveBeenCalledWith({
        where: { id: 5, ...OWNED_BY_PARENT_12 },
        select: CHILD_SELECT,
      });
    });
  });

  test('countParents рахує існуючих батьків', async () => {
    const { db, repository } = createRepository();
    await expect(repository.countParents([1, 2])).resolves.toBe(2);
    expect(db.parent.count).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } });
  });

  test('create прив’язує дитину до кожного з батьків', async () => {
    const { db, repository } = createRepository();
    await repository.create({ fullName: 'Іван' }, [1, 2]);
    expect(db.child.create).toHaveBeenCalledWith({
      data: {
        fullName: 'Іван',
        parents: {
          create: [{ parent: { connect: { id: 1 } } }, { parent: { connect: { id: 2 } } }],
        },
      },
      select: CHILD_SELECT,
    });
  });

  test('update', async () => {
    const { db, repository } = createRepository();
    await repository.update(5, { notes: null });
    expect(db.child.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { notes: null },
      select: CHILD_SELECT,
    });
  });
});
