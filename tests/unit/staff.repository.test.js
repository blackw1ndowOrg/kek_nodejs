const { StaffRepository } = require('../../src/modules/staff/staff.repository');

describe('StaffRepository - Unit Tests', () => {
  let mockDb;
  let repo;

  beforeEach(() => {
    mockDb = {
      staff: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    repo = new StaffRepository(mockDb);
  });

  describe('findAll', () => {
    test('викликає findMany без фільтрів', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([]);

      await repo.findAll();

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { id: 'asc' } })
      );
    });

    test('фільтрує за type', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([{ id: 1, type: 'EDUCATOR' }]);

      const result = await repo.findAll({ type: 'EDUCATOR' });

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: 'EDUCATOR' } })
      );
      expect(result).toHaveLength(1);
    });

    test('фільтрує за isActive=true', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([]);

      await repo.findAll({ isActive: true });

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });

    test('фільтрує за isActive=false', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([]);

      await repo.findAll({ isActive: false });

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } })
      );
    });

    test('фільтрує за search', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([]);

      await repo.findAll({ search: 'Олена' });

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fullName: { contains: 'Олена', mode: 'insensitive' } },
        })
      );
    });

    test('комбінує всі фільтри одночасно', async () => {
      mockDb.staff.findMany.mockResolvedValueOnce([]);

      await repo.findAll({ type: 'MANAGER', isActive: true, search: 'Петро' });

      expect(mockDb.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: 'MANAGER',
            isActive: true,
            fullName: { contains: 'Петро', mode: 'insensitive' },
          },
        })
      );
    });
  });

  describe('findById', () => {
    test('повертає запис за id', async () => {
      mockDb.staff.findUnique.mockResolvedValueOnce({ id: 3, fullName: 'Богдан' });

      const result = await repo.findById(3);

      expect(mockDb.staff.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3 } })
      );
      expect(result.fullName).toBe('Богдан');
    });

    test('повертає null якщо запис не знайдено', async () => {
      mockDb.staff.findUnique.mockResolvedValueOnce(null);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    test('створює запис через основний db', async () => {
      const data = { fullName: 'Оксана', type: 'EDUCATOR', isActive: true, userId: null };
      mockDb.staff.create.mockResolvedValueOnce({ id: 1, ...data });

      const result = await repo.create(data);

      expect(mockDb.staff.create).toHaveBeenCalledWith(expect.objectContaining({ data }));
      expect(result.id).toBe(1);
    });

    test('створює запис через tx якщо передано', async () => {
      const txClient = {
        staff: { create: jest.fn().mockResolvedValueOnce({ id: 2, fullName: 'Оксана' }) },
      };

      await repo.create(
        { fullName: 'Оксана', type: 'EDUCATOR', isActive: true, userId: null },
        txClient
      );

      expect(txClient.staff.create).toHaveBeenCalled();
      expect(mockDb.staff.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    test('оновлює запис через основний db', async () => {
      mockDb.staff.update.mockResolvedValueOnce({ id: 1, fullName: 'Оновлено' });

      const result = await repo.update(1, { fullName: 'Оновлено' });

      expect(mockDb.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { fullName: 'Оновлено' } })
      );
      expect(result.fullName).toBe('Оновлено');
    });

    test('оновлює запис через tx якщо передано', async () => {
      const txClient = {
        staff: { update: jest.fn().mockResolvedValueOnce({ id: 1, fullName: 'Tx' }) },
      };

      await repo.update(1, { fullName: 'Tx' }, txClient);

      expect(txClient.staff.update).toHaveBeenCalled();
      expect(mockDb.staff.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    test('видаляє запис через основний db', async () => {
      mockDb.staff.delete.mockResolvedValueOnce({ id: 1 });

      const result = await repo.delete(1);

      expect(mockDb.staff.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.id).toBe(1);
    });

    test('видаляє запис через tx якщо передано', async () => {
      const txClient = {
        staff: { delete: jest.fn().mockResolvedValueOnce({ id: 1 }) },
      };

      await repo.delete(1, txClient);

      expect(txClient.staff.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockDb.staff.delete).not.toHaveBeenCalled();
    });
  });
});
