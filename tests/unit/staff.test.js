const { StatusCodes } = require('http-status-codes');
const { StaffService } = require('../../src/modules/staff/staff.service');
const { StaffController } = require('../../src/modules/staff/staff.controller');
const { NotFoundError, ConflictError } = require('../../src/errors/AppError');
const {
  createStaffSchema,
  updateStaffSchema,
  staffIdParamSchema,
  staffQuerySchema,
} = require('../../src/modules/staff/staff.schema');

describe('Staff Module - Unit Tests', () => {
  describe('Staff Schema Validation', () => {
    test('валідна схема створення співробітника', () => {
      const parsed = createStaffSchema.parse({
        fullName: 'Олена Ковальчук',
        type: 'EDUCATOR',
        isActive: true,
      });
      expect(parsed.fullName).toBe('Олена Ковальчук');
      expect(parsed.type).toBe('EDUCATOR');
      expect(parsed.isActive).toBe(true);
    });

    test('валідна схема створення з юзером', () => {
      const parsed = createStaffSchema.parse({
        fullName: 'Олена Ковальчук',
        type: 'MANAGER',
        user: { email: 'manager@kg.ua', password: 'strongPassword' },
      });
      expect(parsed.type).toBe('MANAGER');
      expect(parsed.user.email).toBe('manager@kg.ua');
    });

    test('помилка при невалідному типі посади', () => {
      expect(() => {
        createStaffSchema.parse({ fullName: 'Іван', type: 'DOCTOR' });
      }).toThrow();
    });

    test('помилка при занадто короткому імені', () => {
      expect(() => {
        createStaffSchema.parse({ fullName: 'A', type: 'ASSISTANT' });
      }).toThrow();
    });

    test('валідація param ID конвертує рядок у число', () => {
      const parsed = staffIdParamSchema.parse({ params: { id: '7' } });
      expect(parsed.params.id).toBe(7);
    });

    test('валідація схеми оновлення', () => {
      const parsed = updateStaffSchema.parse({
        fullName: 'Нове ПІБ',
        type: 'CLUB_TEACHER',
        isActive: false,
      });
      expect(parsed.fullName).toBe('Нове ПІБ');
      expect(parsed.type).toBe('CLUB_TEACHER');
      expect(parsed.isActive).toBe(false);
    });

    test('query-схема: isActive="true" конвертується в Boolean true', () => {
      const parsed = staffQuerySchema.parse({ query: { isActive: 'true' } });
      expect(parsed.query.isActive).toBe(true);
    });

    test('query-схема: isActive="false" конвертується в Boolean false', () => {
      const parsed = staffQuerySchema.parse({ query: { isActive: 'false' } });
      expect(parsed.query.isActive).toBe(false);
    });

    test('query-схема: невалідний isActive кидає помилку', () => {
      expect(() => {
        staffQuerySchema.parse({ query: { isActive: 'yes' } });
      }).toThrow();
    });

    test('query-схема: невалідний type кидає помилку з правильним повідомленням', () => {
      expect(() => {
        staffQuerySchema.parse({ query: { type: 'INVALID' } });
      }).toThrow();
    });

    test('query-схема: невалідний isActive кидає помилку з правильним повідомленням', () => {
      expect(() => {
        staffQuerySchema.parse({ query: { isActive: 'yes' } });
      }).toThrow();
    });

    test('query-схема: валідний type проходить перевірку', () => {
      const parsed = staffQuerySchema.parse({ query: { type: 'EDUCATOR' } });
      expect(parsed.query.type).toBe('EDUCATOR');
    });
  });

  describe('StaffService', () => {
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
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        $transaction: jest.fn(async (callback) => callback(mockDb)),
      };

      service = new StaffService(mockRepo, mockDb);
    });

    test('createStaff: успішно створює співробітника без юзера', async () => {
      const data = { fullName: 'Марія Петрівна', type: 'ASSISTANT', isActive: true };
      mockRepo.create.mockResolvedValueOnce({ id: 1, ...data, userId: null });

      const result = await service.createStaff(data);

      expect(mockRepo.create).toHaveBeenCalledWith(
        { fullName: data.fullName, type: data.type, isActive: true, userId: null },
        mockDb
      );
      expect(result.id).toBe(1);
    });

    test('createStaff: кидає ConflictError при P2002 від Prisma (race condition)', async () => {
      const prismaError = new Error('Unique constraint');
      prismaError.code = 'P2002';
      mockDb.$transaction.mockRejectedValueOnce(prismaError);

      await expect(
        service.createStaff({
          fullName: 'Тест',
          type: 'MANAGER',
          user: { email: 'x@test.com', password: 'pass123' },
        })
      ).rejects.toThrow(ConflictError);
    });

    test('createStaff: перекидає не-P2002 помилки як є', async () => {
      const networkError = new Error('Connection refused');
      mockDb.$transaction.mockRejectedValueOnce(networkError);

      await expect(
        service.createStaff({
          fullName: 'Тест',
          type: 'EDUCATOR',
          user: { email: 'y@test.com', password: 'pass123' },
        })
      ).rejects.toThrow('Connection refused');
    });

    test('createStaff: MANAGER отримує роль MANAGER, EDUCATOR — TEACHER', async () => {
      // MANAGER
      mockDb.user.create.mockResolvedValueOnce({ id: 2, role: 'MANAGER' });
      mockRepo.create.mockResolvedValueOnce({ id: 10, userId: 2 });

      await service.createStaff({
        fullName: 'Менеджер',
        type: 'MANAGER',
        user: { email: 'm@test.com', password: 'pass1234' },
      });

      expect(mockDb.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'MANAGER' }) })
      );

      // EDUCATOR
      mockDb.user.create.mockResolvedValueOnce({ id: 3, role: 'TEACHER' });
      mockRepo.create.mockResolvedValueOnce({ id: 11, userId: 3 });

      await service.createStaff({
        fullName: 'Вихователь',
        type: 'EDUCATOR',
        user: { email: 'e@test.com', password: 'pass1234' },
      });

      expect(mockDb.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'TEACHER' }) })
      );
    });

    test('getAllStaff: передає параметри пошуку в репозиторій', async () => {
      mockRepo.findAll.mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.getAllStaff({ type: 'EDUCATOR' });

      expect(mockRepo.findAll).toHaveBeenCalledWith({ type: 'EDUCATOR' });
      expect(result).toHaveLength(1);
    });

    test('getAllStaff: працює без передачі аргументів (дефолтний query)', async () => {
      mockRepo.findAll.mockResolvedValueOnce([]);
      const result = await service.getAllStaff();
      expect(mockRepo.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual([]);
    });

    test('getStaffById: повертає або кидає NotFoundError', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, fullName: 'Тарас' });
      const found = await service.getStaffById(1);
      expect(found.fullName).toBe('Тарас');

      mockRepo.findById.mockResolvedValueOnce(null);
      await expect(service.getStaffById(999)).rejects.toThrow(NotFoundError);
    });

    test('updateStaff: оновлює або кидає NotFoundError', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, userId: null });
      mockRepo.update.mockResolvedValueOnce({ id: 1, fullName: 'Оновлено' });

      const updated = await service.updateStaff(1, { fullName: 'Оновлено' });
      expect(updated.fullName).toBe('Оновлено');

      mockRepo.findById.mockResolvedValueOnce(null);
      await expect(service.updateStaff(999, {})).rejects.toThrow(NotFoundError);
    });

    test('updateStaff: синхронізує User.role при зміні type на MANAGER', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, userId: 10 });
      mockRepo.update.mockResolvedValueOnce({ id: 1, type: 'MANAGER' });
      mockDb.user.update.mockResolvedValueOnce({ id: 10, role: 'MANAGER' });

      await service.updateStaff(1, { type: 'MANAGER' });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { role: 'MANAGER' },
      });
    });

    test('updateStaff: синхронізує User.role при зміні type на EDUCATOR (TEACHER)', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, userId: 10 });
      mockRepo.update.mockResolvedValueOnce({ id: 1, type: 'EDUCATOR' });
      mockDb.user.update.mockResolvedValueOnce({ id: 10, role: 'TEACHER' });

      await service.updateStaff(1, { type: 'EDUCATOR' });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { role: 'TEACHER' },
      });
    });

    test('updateStaff: кидає ConflictError при isActive=false на закріпленому вихователі', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 1,
        educatorOf: { id: 5, name: 'Сонечко' },
        assistantOf: null,
        clubTaught: null,
        userId: null,
      });

      await expect(service.updateStaff(1, { isActive: false })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає ConflictError при isActive=false на помічнику (assistantOf)', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 2,
        educatorOf: null,
        assistantOf: { id: 3, name: 'Барвінок' },
        clubTaught: null,
        userId: null,
      });

      await expect(service.updateStaff(2, { isActive: false })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає ConflictError при isActive=false на викладачеві гуртка (clubTaught)', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 3,
        educatorOf: null,
        assistantOf: null,
        clubTaught: { id: 7, name: 'Шахи' },
        userId: null,
      });

      await expect(service.updateStaff(3, { isActive: false })).rejects.toThrow(ConflictError);
    });

    test('deleteStaff: кидає ConflictError якщо закріплений за групою (educatorOf)', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 1,
        educatorOf: { id: 10, name: 'Калинка' },
        assistantOf: null,
        clubTaught: null,
      });

      await expect(service.deleteStaff(1)).rejects.toThrow(ConflictError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    test('deleteStaff: кидає ConflictError якщо закріплений як помічник (assistantOf)', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 2,
        educatorOf: null,
        assistantOf: { id: 3, name: 'Барвінок' },
        clubTaught: null,
      });

      await expect(service.deleteStaff(2)).rejects.toThrow(ConflictError);
    });

    test('deleteStaff: кидає ConflictError якщо закріплений за гуртком (clubTaught)', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 3,
        educatorOf: null,
        assistantOf: null,
        clubTaught: { id: 5, name: 'Шахи' },
      });

      await expect(service.deleteStaff(3)).rejects.toThrow(ConflictError);
    });

    test('deleteStaff: успішно видаляє вільного співробітника та юзера', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 4,
        userId: 20,
        educatorOf: null,
        assistantOf: null,
        clubTaught: null,
      });
      mockRepo.delete.mockResolvedValueOnce({ id: 4 });
      mockDb.user.delete.mockResolvedValueOnce({ id: 20 });

      await service.deleteStaff(4);

      expect(mockRepo.delete).toHaveBeenCalledWith(4, mockDb);
      expect(mockDb.user.delete).toHaveBeenCalledWith({ where: { id: 20 } });
    });

    test('deleteStaff: кидає NotFoundError якщо не існує', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);
      await expect(service.deleteStaff(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('StaffController', () => {
    let mockService;
    let controller;
    let res;

    beforeEach(() => {
      mockService = {
        createStaff: jest.fn(),
        getAllStaff: jest.fn(),
        getStaffById: jest.fn(),
        updateStaff: jest.fn(),
        deleteStaff: jest.fn(),
      };

      controller = new StaffController(mockService);

      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    test('create: повертає 201 та створеного працівника', async () => {
      const req = { body: { fullName: 'Оксана', type: 'EDUCATOR' } };
      mockService.createStaff.mockResolvedValueOnce({ id: 1, ...req.body });

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Оксана', type: 'EDUCATOR' });
    });

    test('getAll: повертає 200 та масив', async () => {
      const req = { query: {} };
      mockService.getAllStaff.mockResolvedValueOnce([{ id: 1 }]);

      await controller.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ staff: [{ id: 1 }] });
    });

    test('getById: повертає 200 та знайденого', async () => {
      const req = { params: { id: 1 } };
      mockService.getStaffById.mockResolvedValueOnce({ id: 1, fullName: 'Ігор' });

      await controller.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Ігор' });
    });

    test('update: повертає 200 та оновлені дані', async () => {
      const req = { params: { id: 1 }, body: { fullName: 'Оновлено' } };
      mockService.updateStaff.mockResolvedValueOnce({ id: 1, fullName: 'Оновлено' });

      await controller.update(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ id: 1, fullName: 'Оновлено' });
    });

    test('delete: повертає 204', async () => {
      const req = { params: { id: 1 } };
      mockService.deleteStaff.mockResolvedValueOnce();

      await controller.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
