const { StatusCodes } = require('http-status-codes');
const { StaffService } = require('../../src/modules/staff/staff.service');
const { StaffController } = require('../../src/modules/staff/staff.controller');
const { NotFoundError, ConflictError } = require('../../src/errors/AppError');
const {
  createStaffSchema,
  updateStaffSchema,
  updateStaffRouteSchema,
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

    test('updateStaffRouteSchema валідує params та body разом', () => {
      const parsed = updateStaffRouteSchema.parse({
        params: { id: '12' },
        body: { fullName: 'Оновлений Петро', isActive: true },
      });
      expect(parsed.params.id).toBe(12);
      expect(parsed.body.fullName).toBe('Оновлений Петро');
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
        $transaction: jest.fn(async (callback) => callback(mockDb)),
        user: {
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      };

      service = new StaffService(mockRepo, mockDb);
    });

    test('createStaff: успішно створює співробітника без юзера', async () => {
      const data = { fullName: 'Марія', type: 'EDUCATOR', isActive: true };
      mockRepo.create.mockResolvedValueOnce({ id: 1, ...data, userId: null });

      const result = await service.createStaff(data);

      expect(mockRepo.create).toHaveBeenCalledWith(
        { fullName: 'Марія', type: 'EDUCATOR', isActive: true, userId: null },
        mockDb
      );
      expect(result.id).toBe(1);
    });

    test('createStaff: перехоплює P2002 і кидає ConflictError', async () => {
      const prismaError = new Error('Unique constraint failed');
      prismaError.code = 'P2002';
      mockDb.$transaction.mockRejectedValueOnce(prismaError);

      await expect(
        service.createStaff({
          fullName: 'Ольга',
          type: 'MANAGER',
          user: { email: 'dup@test.com', password: 'password' },
        })
      ).rejects.toThrow(ConflictError);
    });

    test('createStaff: прокидає невідому помилку далі, якщо це не P2002', async () => {
      mockDb.$transaction.mockRejectedValueOnce(new Error('DB error'));
      await expect(service.createStaff({ fullName: 'Тест', type: 'EDUCATOR' }))
        .rejects.toThrow('DB error');
    });

    test('createStaff: призначає role=MANAGER для менеджера та role=TEACHER для інших', async () => {
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

    test('updateStaff: синхронізує User.role і повертає оновлений об\'єкт із новою роллю', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, type: 'EDUCATOR', userId: 10 });
      mockRepo.update.mockResolvedValueOnce({
        id: 1,
        type: 'MANAGER',
        user: { id: 10, email: 'm@kg.ua', role: 'TEACHER' },
      });
      mockDb.user.update.mockResolvedValueOnce({ id: 10, role: 'MANAGER' });

      const updated = await service.updateStaff(1, { type: 'MANAGER' });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { role: 'MANAGER' },
      });
      expect(updated.user.role).toBe('MANAGER');
    });

    test('updateStaff: синхронізує User.role при зміні type на EDUCATOR (TEACHER)', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, type: 'MANAGER', userId: 10 });
      mockRepo.update.mockResolvedValueOnce({ id: 1, type: 'EDUCATOR', user: { id: 10, role: 'MANAGER' } });
      mockDb.user.update.mockResolvedValueOnce({ id: 10, role: 'TEACHER' });

      const updated = await service.updateStaff(1, { type: 'EDUCATOR' });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { role: 'TEACHER' },
      });
      expect(updated.user.role).toBe('TEACHER');
    });

    test('updateStaff: коректно працює якщо updated.user відсутній', async () => {
      mockRepo.findById.mockResolvedValueOnce({ id: 1, type: 'MANAGER', userId: 10 });
      mockRepo.update.mockResolvedValueOnce({ id: 1, type: 'EDUCATOR' });
      mockDb.user.update.mockResolvedValueOnce({ id: 10, role: 'TEACHER' });

      const updated = await service.updateStaff(1, { type: 'EDUCATOR' });
      expect(updated.user).toBeUndefined();
    });

    test('updateStaff: кидає ConflictError при спробі змінити type закріпленого вихователя', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 1,
        type: 'EDUCATOR',
        educatorOf: { id: 5, name: 'Сонечко' },
        assistantOf: null,
        clubTaught: null,
        userId: null,
      });

      await expect(service.updateStaff(1, { type: 'MANAGER' })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає ConflictError при спробі змінити type закріпленого помічника', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 2,
        type: 'ASSISTANT',
        educatorOf: null,
        assistantOf: { id: 3, name: 'Барвінок' },
        clubTaught: null,
        userId: null,
      });

      await expect(service.updateStaff(2, { type: 'EDUCATOR' })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає ConflictError при спробі змінити type закріпленого викладача гуртка', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 3,
        type: 'CLUB_TEACHER',
        educatorOf: null,
        assistantOf: null,
        clubTaught: { id: 7, name: 'Шахи' },
        userId: null,
      });

      await expect(service.updateStaff(3, { type: 'MANAGER' })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає ConflictError при isActive=false на закріпленому вихователі', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: 1,
        type: 'EDUCATOR',
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
        type: 'ASSISTANT',
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
        type: 'CLUB_TEACHER',
        educatorOf: null,
        assistantOf: null,
        clubTaught: { id: 7, name: 'Шахи' },
        userId: null,
      });

      await expect(service.updateStaff(3, { isActive: false })).rejects.toThrow(ConflictError);
    });

    test('updateStaff: кидає NotFoundError якщо працівника не існує', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);
      await expect(service.updateStaff(999, { fullName: 'Тест' })).rejects.toThrow(NotFoundError);
    });

    test('deleteStaff: успішно видаляє співробітника та user', async () => {
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
        clubTaught: { id: 1, name: 'Малювання' },
      });

      await expect(service.deleteStaff(3)).rejects.toThrow(ConflictError);
    });

    test('deleteStaff: кидає NotFoundError якщо не існує', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);
      await expect(service.deleteStaff(999)).rejects.toThrow(NotFoundError);
    });

    describe('getStaffSalary (доменні функції salary.js)', () => {
      test('вираховує зарплату для EDUCATOR з урахуванням дітей понад 12 (15 дітей)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 1,
          fullName: 'Олена Вихователь',
          type: 'EDUCATOR',
          isActive: true,
          educatorOf: {
            name: 'Сонечко',
            children: new Array(15).fill({ id: 1 }),
          },
        });

        const salaryInfo = await service.getStaffSalary(1);

        // 15 дітей: 15 * 200_000 + 3 * 300_000 = 3_000_000 + 900_000 = 3_900_000 копійок
        expect(salaryInfo.salary).toBe(3900000);
        expect(salaryInfo.details.childrenCount).toBe(15);
        expect(salaryInfo.details.groupName).toBe('Сонечко');
      });

      test('вираховує зарплату для EDUCATOR без закріпленої групи (0 дітей)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 1,
          fullName: 'Новий Вихователь',
          type: 'EDUCATOR',
          isActive: true,
          educatorOf: null,
        });

        const salaryInfo = await service.getStaffSalary(1);
        expect(salaryInfo.salary).toBe(0);
        expect(salaryInfo.details.childrenCount).toBe(0);
      });

      test('вираховує зарплату для ASSISTANT з доплатою понад 12 (14 дітей)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 2,
          fullName: 'Помічник Оля',
          type: 'ASSISTANT',
          isActive: true,
          assistantOf: {
            name: 'Калинка',
            children: new Array(14).fill({ id: 1 }),
          },
        });

        const salaryInfo = await service.getStaffSalary(2);

        // 14 дітей: базова 2_000_000 + 2 * 300_000 = 2_600_000 копійок
        expect(salaryInfo.salary).toBe(2600000);
        expect(salaryInfo.details.childrenCount).toBe(14);
      });

      test('вираховує зарплату для ASSISTANT без закріпленої групи (0 дітей)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 2,
          fullName: 'Помічник без групи',
          type: 'ASSISTANT',
          isActive: true,
          assistantOf: null,
        });

        const salaryInfo = await service.getStaffSalary(2);
        expect(salaryInfo.salary).toBe(2000000);
        expect(salaryInfo.details.childrenCount).toBe(0);
      });

      test('getStaffSalary: default salary 0 для невідомого типу', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 99,
          fullName: 'Хтось',
          type: 'OTHER',
          isActive: true,
        });
        const res = await service.getStaffSalary(99);
        expect(res.salary).toBe(0);
      });

      test('вираховує фіксовану зарплату для CLUB_TEACHER (40 000 грн = 4 000 000 копійок)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 3,
          fullName: 'Вчитель Шахів',
          type: 'CLUB_TEACHER',
          isActive: true,
          clubTaught: { name: 'Шахи' },
        });

        const salaryInfo = await service.getStaffSalary(3);
        expect(salaryInfo.salary).toBe(4000000);
      });

      test('вираховує фіксовану зарплату для MANAGER (80 000 грн = 8 000 000 копійок)', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 4,
          fullName: 'Головний Менеджер',
          type: 'MANAGER',
          isActive: true,
        });

        const salaryInfo = await service.getStaffSalary(4);
        expect(salaryInfo.salary).toBe(8000000);
      });

      test('використовує динамічні ставки з settingsService (якщо змінено в налаштуваннях)', async () => {
        const customSettings = {
          get: jest.fn((key) => {
            if (key === 'MANAGER_SALARY') return 9000000;
            return 0;
          }),
        };
        const customService = new StaffService(mockRepo, mockDb, customSettings);
        mockRepo.findById.mockResolvedValueOnce({
          id: 4,
          fullName: 'Головний Менеджер',
          type: 'MANAGER',
          isActive: true,
        });

        const salaryInfo = await customService.getStaffSalary(4);
        expect(customSettings.get).toHaveBeenCalledWith('MANAGER_SALARY');
        expect(salaryInfo.salary).toBe(9000000);
      });

      test('повертає salary = 0 для неактивного співробітника', async () => {
        mockRepo.findById.mockResolvedValueOnce({
          id: 5,
          fullName: 'Звільнений',
          type: 'MANAGER',
          isActive: false,
        });

        const salaryInfo = await service.getStaffSalary(5);
        expect(salaryInfo.salary).toBe(0);
        expect(salaryInfo.isActive).toBe(false);
      });

      test('викидає NotFoundError якщо співробітника не знайдено', async () => {
        mockRepo.findById.mockResolvedValueOnce(null);
        await expect(service.getStaffSalary(999)).rejects.toThrow(NotFoundError);
      });
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
        getStaffSalary: jest.fn(),
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

    test('getSalary: повертає 200 та розрахунок зарплати', async () => {
      const req = { params: { id: 1 } };
      mockService.getStaffSalary.mockResolvedValueOnce({
        staffId: 1,
        salary: 3900000,
        type: 'EDUCATOR',
      });

      await controller.getSalary(req, res);

      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ staffId: 1, salary: 3900000 })
      );
    });
  });
});
