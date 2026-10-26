const { ParentsRepository } = require('../../src/modules/parents/parents.repository');

describe('ParentsRepository - Unit Tests', () => {
  let mockDb;
  let repo;

  beforeEach(() => {
    mockDb = {
      parent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    repo = new ParentsRepository(mockDb);
  });

  describe('findAll', () => {
    test('викликає findMany без фільтрів', async () => {
      mockDb.parent.findMany.mockResolvedValueOnce([]);

      const result = await repo.findAll();

      expect(mockDb.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { id: 'asc' } })
      );
      expect(result).toEqual([]);
    });

    test('викликає findMany з фільтром search', async () => {
      mockDb.parent.findMany.mockResolvedValueOnce([{ id: 1, fullName: 'Іван' }]);

      const result = await repo.findAll({ search: 'Іван' });

      expect(mockDb.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { fullName: { contains: 'Іван', mode: 'insensitive' } },
              { phone: { contains: 'Іван' } },
            ],
          },
        })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    test('викликає findUnique з правильним id', async () => {
      mockDb.parent.findUnique.mockResolvedValueOnce({ id: 5, fullName: 'Марія' });

      const result = await repo.findById(5);

      expect(mockDb.parent.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } })
      );
      expect(result.fullName).toBe('Марія');
    });

    test('повертає null якщо запис не знайдено', async () => {
      mockDb.parent.findUnique.mockResolvedValueOnce(null);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    test('створює запис через основний db якщо tx не передано', async () => {
      const data = { fullName: 'Тарас', phone: '+380501234567', debt: 0, userId: null };
      mockDb.parent.create.mockResolvedValueOnce({ id: 1, ...data });

      const result = await repo.create(data);

      expect(mockDb.parent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data })
      );
      expect(result.id).toBe(1);
    });

    test('створює запис через tx якщо передано', async () => {
      const txClient = {
        parent: { create: jest.fn().mockResolvedValueOnce({ id: 2, fullName: 'Тарас' }) },
      };

      const data = { fullName: 'Тарас', phone: '+380501234567', debt: 0, userId: null };

      const result = await repo.create(data, txClient);

      expect(txClient.parent.create).toHaveBeenCalled();
      expect(mockDb.parent.create).not.toHaveBeenCalled();
      expect(result.id).toBe(2);
    });
  });

  describe('update', () => {
    test('оновлює запис через основний db', async () => {
      mockDb.parent.update.mockResolvedValueOnce({ id: 1, fullName: 'Нове' });

      const result = await repo.update(1, { fullName: 'Нове' });

      expect(mockDb.parent.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { fullName: 'Нове' } })
      );
      expect(result.fullName).toBe('Нове');
    });

    test('оновлює запис через tx якщо передано', async () => {
      const txClient = {
        parent: { update: jest.fn().mockResolvedValueOnce({ id: 1, fullName: 'Tx' }) },
      };

      const result = await repo.update(1, { fullName: 'Tx' }, txClient);

      expect(txClient.parent.update).toHaveBeenCalled();
      expect(mockDb.parent.update).not.toHaveBeenCalled();
      expect(result.fullName).toBe('Tx');
    });
  });

  describe('delete', () => {
    test('видаляє запис через основний db', async () => {
      mockDb.parent.delete.mockResolvedValueOnce({ id: 1 });

      const result = await repo.delete(1);

      expect(mockDb.parent.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.id).toBe(1);
    });

    test('видаляє запис через tx якщо передано', async () => {
      const txClient = {
        parent: { delete: jest.fn().mockResolvedValueOnce({ id: 1 }) },
      };

      const result = await repo.delete(1, txClient);

      expect(txClient.parent.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockDb.parent.delete).not.toHaveBeenCalled();
      expect(result.id).toBe(1);
    });
  });
});
