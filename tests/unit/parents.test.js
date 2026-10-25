const { StatusCodes } = require('http-status-codes');
const { ParentsService } = require('../../src/modules/parents/parents.service');
const { ParentsController } = require('../../src/modules/parents/parents.controller');
const { NotFoundError, ConflictError } = require('../../src/errors/AppError');
const {
  createParentSchema,
  updateParentSchema,
  parentIdParamSchema,
} = require('../../src/modules/parents/parents.schema');

describe('Parents Module - Unit Tests', () => {
  describe('Parents Schema Validation', () => {
    test('валідна схема створення батьків без юзера', () => {
      const input = {
        fullName: 'Іваненко Петро Олексійович',
        phone: '+380501234567',
        debt: 150000,
      };

      const parsed = createParentSchema.parse(input);
      expect(parsed.fullName).toBe('Іваненко Петро Олексійович');
      expect(parsed.phone).toBe('+380501234567');
      expect(parsed.debt).toBe(150000);
    });

    test('валідна схема створення батьків з юзером', () => {
      const input = {
        fullName: 'Іваненко Петро',
        phone: '050-123-45-67',
        user: {
          email: 'petro@test.com',
          password: 'password123',
        },
      };

      const parsed = createParentSchema.parse(input);
      expect(parsed.phone).toBe('0501234567');
      expect(parsed.debt).toBe(0);
      expect(parsed.user.email).toBe('petro@test.com');
    });

    test('помилка при занадто короткому ПІБ', () => {
      expect(() => {
        createParentSchema.parse({ fullName: 'A', phone: '+380501234567' });
      }).toThrow();
    });

    test('помилка при невалідному телефоні', () => {
      expect(() => {
        createParentSchema.parse({ fullName: 'Іваненко Петро', phone: '123' });
      }).toThrow();
    });

    test('помилка при від\'ємному боргу', () => {
      expect(() => {
        createParentSchema.parse({
          fullName: 'Іваненко Петро',
          phone: '+380501234567',
          debt: -100,
        });
      }).toThrow();
    });

    test('валідація param ID конвертує рядок у число', () => {
      const parsed = parentIdParamSchema.parse({ params: { id: '42' } });
      expect(parsed.params.id).toBe(42);
    });

    test('помилка param ID якщо передано не число', () => {
      expect(() => {
        parentIdParamSchema.parse({ params: { id: 'abc' } });
      }).toThrow();
    });

    test('валідація схеми оновлення', () => {
      const parsed = updateParentSchema.parse({
        fullName: 'Нове Ім\'я',
        debt: 20000,
      });
      expect(parsed.fullName).toBe('Нове Ім\'я');
      expect(parsed.debt).toBe(20000);
    });
  });

  describe('ParentsService', () => {
    let mockRepo;
    let mockDb;
    let service;

    beforeEach(() => {
      mockRepo = {
        create: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      };

      mockDb = {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
        $transaction: jest.fn(async (callback) => callback(mockDb)),
      };

      service = new ParentsService(mockRepo, mockDb);
    });

    test('createParent: успішно створює батьків без створення юзера', async () => {
      const data = {
        fullName: 'Сидоренко Василь',
        phone: '+380991234567',
        debt: 0,
      };

      mockRepo.create.mockResolvedValueOnce({ id: 1, ...data, userId: null });

      const result = await service.createParent(data);

      expect(mockDb.user.findUnique).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(
        { fullName: data.fullName, phone: data.phone, debt: 0, userId: null },
        mockDb
      );
      expect(result.id).toBe(1);
    });

    test('createParent: викидає ConflictError якщо email вже зайнятий', async () => {
      const data = {
        fullName: 'Сидоренко Василь',
        phone: '+380991234567',
        user: { email: 'vasyl@test.com', password: 'secretPassword' },
      };

      mockDb.user.findUnique.mockResolvedValueOnce({ id: 99, email: data.user.email });

      await expect(service.createParent(data)).rejects.toThrow(ConflictError);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    test('createParent: успішно створює юзера та батьків у транзакції', async () => {
      const data = {
        fullName: 'Сидоренко Василь',
        phone: '+380991234567',
        debt: 5000,
        user: { email: 'vasyl@test.com', password: 'secretPassword' },
      };

      mockDb.user.findUnique.mockResolvedValueOnce(null);
      mockDb.user.create.mockResolvedValueOnce({
        id: 10,
        email: data.user.email,
        role: 'PARENT',
      });
      mockRepo.create.mockResolvedValueOnce({
        id: 1,
        fullName: data.fullName,
        phone: data.phone,
        debt: 5000,
        userId: 10,
      });

      const result = await service.createParent(data);

      expect(mockDb.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'vasyl@test.com',
            role: 'PARENT',
          }),
        })
      );
      expect(result.userId).toBe(10);
    });

    test('getAllParents: повертає список батьків з репозиторію', async () => {
      const parents = [{ id: 1, fullName: 'Мама 1' }, { id: 2, fullName: 'Тато 2' }];
      mockRepo.findAll.mockResolvedValueOnce(parents);

      const result = await service.getAllParents({ search: 'Мама' });

      expect(mockRepo.findAll).toHaveBeenCalledWith({ search: 'Мама' });
      expect(result).toEqual(parents);
    });

    test('getParentById: повертає батьків, якщо знайдено', async () => {
      const parent = { id: 1, fullName: 'Іван' };
      mockRepo.findById.mockResolvedValueOnce(parent);

      const result = await service.getParentById(1);

      expect(result).toEqual(parent);
    });

    test('getParentById: викидає NotFoundError, якщо запису немає', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.getParentById(999)).rejects.toThrow(NotFoundError);
    });

    test('updateParent: успішно оновлює дані', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, fullName: 'Старе' });
      mockRepo.update.mockResolvedValueOnce({ id: 1, fullName: 'Нове' });

      const result = await service.updateParent(1, { fullName: 'Нове' });

      expect(result.fullName).toBe('Нове');
    });

    test('updateParent: викидає NotFoundError при оновленні неіснуючого запису', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.updateParent(999, { fullName: 'Нове' })).rejects.toThrow(
        NotFoundError
      );
    });

    test('deleteParent: викидає ConflictError якщо у батьків є борг', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, debt: 5000 });

      await expect(service.deleteParent(1)).rejects.toThrow(ConflictError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    test('deleteParent: успішно видаляє батьків та прив\'язаного юзера при debt = 0', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, debt: 0, userId: 15 });
      mockRepo.delete.mockResolvedValueOnce({ id: 1 });
      mockDb.user.delete.mockResolvedValueOnce({ id: 15 });

      await service.deleteParent(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1, mockDb);
      expect(mockDb.user.delete).toHaveBeenCalledWith({ where: { id: 15 } });
    });

    test('deleteParent: викидає NotFoundError якщо батьків не знайдено', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      await expect(service.deleteParent(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('ParentsController', () => {
    let mockService;
    let controller;
    let res;

    beforeEach(() => {
      mockService = {
        createParent: jest.fn(),
        getAllParents: jest.fn(),
        getParentById: jest.fn(),
        updateParent: jest.fn(),
        deleteParent: jest.fn(),
      };

      controller = new ParentsController(mockService);

      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    test('create: повертає 201 та створений об\'єкт', async () => {
      const req = { body: { fullName: 'Тест' } };
      mockService.createParent.mockResolvedValueOnce({ id: 1, ...req.body });

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Тест' });
    });

    test('getAll: повертає 200 та список батьків', async () => {
      const req = { query: {} };
      mockService.getAllParents.mockResolvedValueOnce([{ id: 1 }]);

      await controller.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ parents: [{ id: 1 }] });
    });

    test('getById: повертає 200 та об\'єкт батьків', async () => {
      const req = { params: { id: 1 } };
      mockService.getParentById.mockResolvedValueOnce({ id: 1, fullName: 'Тест' });

      await controller.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Тест' });
    });

    test('update: повертає 200 та оновлені дані', async () => {
      const req = { params: { id: 1 }, body: { fullName: 'Оновлено' } };
      mockService.updateParent.mockResolvedValueOnce({ id: 1, fullName: 'Оновлено' });

      await controller.update(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Оновлено' });
    });

    test('delete: повертає 204 No Content', async () => {
      const req = { params: { id: 1 } };
      mockService.deleteParent.mockResolvedValueOnce();

      await controller.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
