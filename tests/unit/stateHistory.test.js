const {
  toClientModelName,
  extractEntityId,
  safeJsonSerialize,
  createStateHistoryExtension,
} = require('../../src/config/prisma');

describe('StateHistory - Unit Tests', () => {
  describe('toClientModelName', () => {
    test('повертає порожній рядок для falsy значень', () => {
      expect(toClientModelName('')).toBe('');
      expect(toClientModelName(null)).toBe('');
      expect(toClientModelName(undefined)).toBe('');
    });

    test('коректно переводить першу літеру в нижній регістр для простих та складених моделей', () => {
      expect(toClientModelName('Staff')).toBe('staff');
      expect(toClientModelName('User')).toBe('user');
      expect(toClientModelName('ScheduleSlot')).toBe('scheduleSlot');
      expect(toClientModelName('ParentChild')).toBe('parentChild');
      expect(toClientModelName('StateHistory')).toBe('stateHistory');
    });
  });

  describe('extractEntityId', () => {
    test('повертає null для невалідних даних', () => {
      expect(extractEntityId(null)).toBeNull();
      expect(extractEntityId(undefined)).toBeNull();
      expect(extractEntityId('not-an-object')).toBeNull();
      expect(extractEntityId({})).toBeNull();
    });

    test('витягує числовий або рядковий id', () => {
      expect(extractEntityId({ id: 42 })).toBe('42');
      expect(extractEntityId({ id: 'abc-123' })).toBe('abc-123');
    });

    test('витягує key для Setting', () => {
      expect(extractEntityId({ key: 'TUITION_MONTHLY' })).toBe('TUITION_MONTHLY');
    });

    test('формує складений ідентифікатор для ParentChild', () => {
      expect(extractEntityId({ parentId: 5, childId: 12 })).toBe('5:12');
      expect(extractEntityId({ parentId_childId: { parentId: 5, childId: 12 } })).toBe('5:12');
    });
  });

  describe('safeJsonSerialize', () => {
    test('повертає null для невалідних значень або примітивів', () => {
      expect(safeJsonSerialize(null)).toBeNull();
      expect(safeJsonSerialize(undefined)).toBeNull();
      expect(safeJsonSerialize(123)).toBeNull();
      expect(safeJsonSerialize('test')).toBeNull();
    });

    test('успішно серіалізує об’єкти з BigInt без винятків', () => {
      const obj = { id: 1, bigVal: 9007199254740991n };
      expect(safeJsonSerialize(obj)).toEqual({ id: 1, bigVal: '9007199254740991' });
    });

    test('безпечно повертає null при циклічних посиланнях', () => {
      const circular = { name: 'cycle' };
      circular.self = circular;
      expect(safeJsonSerialize(circular)).toBeNull();
    });
  });

  describe('createStateHistoryExtension', () => {
    let mockBaseClient;
    let extension;
    let allOperations;

    beforeEach(() => {
      mockBaseClient = {
        stateHistory: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
        child: {
          findUnique: jest.fn(),
        },
        setting: {
          findUnique: jest.fn(),
        },
      };

      extension = createStateHistoryExtension(mockBaseClient);
      allOperations = extension.query.$allModels.$allOperations;
    });

    test('ігнорує операції над самою моделлю StateHistory для уникнення рекурсії', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ id: 100 });
      const args = { data: { entityName: 'Test' } };

      const result = await allOperations({
        model: 'StateHistory',
        operation: 'create',
        args,
        query: mockQuery,
      });

      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 100 });
    });

    test('ігнорує операції читання (findMany, findUnique, count)', async () => {
      const mockQuery = jest.fn().mockResolvedValue([{ id: 1 }]);
      const args = { where: { isActive: true } };

      const result = await allOperations({
        model: 'Child',
        operation: 'findMany',
        args,
        query: mockQuery,
      });

      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: 1 }]);
    });

    test('логує create операцію з afterState і beforeState: null', async () => {
      const createdRecord = { id: 7, fullName: 'Олексій', age: 4 };
      const mockQuery = jest.fn().mockResolvedValue(createdRecord);
      const args = { data: { fullName: 'Олексій', age: 4 } };

      const result = await allOperations({
        model: 'Child',
        operation: 'create',
        args,
        query: mockQuery,
      });

      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: {
          entityName: 'Child',
          entityId: '7',
          action: 'create',
          beforeState: null,
          afterState: createdRecord,
        },
      });
      expect(result).toEqual(createdRecord);
    });

    test('логує update операцію, зчитуючи стан ДО мутації', async () => {
      const beforeRecord = { id: 7, fullName: 'Олексій', age: 4 };
      const afterRecord = { id: 7, fullName: 'Олексій', age: 5 };
      mockBaseClient.child.findUnique.mockResolvedValueOnce(beforeRecord);

      const mockQuery = jest.fn().mockResolvedValue(afterRecord);
      const args = { where: { id: 7 }, data: { age: 5 } };

      const result = await allOperations({
        model: 'Child',
        operation: 'update',
        args,
        query: mockQuery,
      });

      expect(mockBaseClient.child.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: {
          entityName: 'Child',
          entityId: '7',
          action: 'update',
          beforeState: beforeRecord,
          afterState: afterRecord,
        },
      });
      expect(result).toEqual(afterRecord);
    });

    test('логує delete операцію: afterState дорівнює null', async () => {
      const deletedRecord = { id: 7, fullName: 'Олексій' };
      mockBaseClient.child.findUnique.mockResolvedValueOnce(deletedRecord);

      const mockQuery = jest.fn().mockResolvedValue(deletedRecord);
      const args = { where: { id: 7 } };

      const result = await allOperations({
        model: 'Child',
        operation: 'delete',
        args,
        query: mockQuery,
      });

      expect(mockBaseClient.child.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: {
          entityName: 'Child',
          entityId: '7',
          action: 'delete',
          beforeState: deletedRecord,
          afterState: null,
        },
      });
      expect(result).toEqual(deletedRecord);
    });

    test('логує upsert операцію', async () => {
      const upsertedRecord = { key: 'TUITION_MONTHLY', value: 1500000 };
      const mockQuery = jest.fn().mockResolvedValue(upsertedRecord);
      const args = {
        where: { key: 'TUITION_MONTHLY' },
        create: { key: 'TUITION_MONTHLY', value: 1500000 },
        update: { value: 1500000 },
      };

      const result = await allOperations({
        model: 'Setting',
        operation: 'upsert',
        args,
        query: mockQuery,
      });

      expect(mockQuery).toHaveBeenCalledWith(args);
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: {
          entityName: 'Setting',
          entityId: 'TUITION_MONTHLY',
          action: 'upsert',
          beforeState: null,
          afterState: upsertedRecord,
        },
      });
      expect(result).toEqual(upsertedRecord);
    });

    test('не ламає виконання запиту, якщо пошук beforeState кидає виняток', async () => {
      mockBaseClient.child.findUnique.mockRejectedValueOnce(new Error('DB read error'));
      const afterRecord = { id: 7, age: 5 };
      const mockQuery = jest.fn().mockResolvedValue(afterRecord);

      const result = await allOperations({
        model: 'Child',
        operation: 'update',
        args: { where: { id: 7 }, data: { age: 5 } },
        query: mockQuery,
      });

      expect(result).toEqual(afterRecord);
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'update',
          beforeState: null,
          afterState: afterRecord,
        }),
      });
    });

    test('не ламає виконання запиту, якщо запис у stateHistory.create кидає виняток', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBaseClient.stateHistory.create.mockRejectedValueOnce(new Error('Audit table error'));

      const createdRecord = { id: 9, fullName: 'Іван' };
      const mockQuery = jest.fn().mockResolvedValue(createdRecord);

      const result = await allOperations({
        model: 'Child',
        operation: 'create',
        args: { data: { fullName: 'Іван' } },
        query: mockQuery,
      });

      expect(result).toEqual(createdRecord);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StateHistory Error]'),
        'Audit table error'
      );
      consoleErrorSpy.mockRestore();
    });

    test('пропускає пошук beforeState, якщо модель не має findUnique або не передано where', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ id: 1 });
      await allOperations({
        model: 'UnknownModel',
        operation: 'update',
        args: {},
        query: mockQuery,
      });
      expect(mockQuery).toHaveBeenCalled();
    });

    test('безпечно завершує роботу, якщо baseClient.stateHistory.create відсутній', async () => {
      const clientWithoutHistory = { child: {} };
      const ext = createStateHistoryExtension(clientWithoutHistory);
      const mockQuery = jest.fn().mockResolvedValue({ id: 1 });
      const res = await ext.query.$allModels.$allOperations({
        model: 'Child',
        operation: 'create',
        args: { data: {} },
        query: mockQuery,
      });
      expect(res).toEqual({ id: 1 });
    });

    test('якщо результат не має id, бере id з beforeState', async () => {
      mockBaseClient.child.findUnique.mockResolvedValueOnce({ id: 99 });
      const mockQuery = jest.fn().mockResolvedValue(null);
      await allOperations({
        model: 'Child',
        operation: 'delete',
        args: { where: { id: 99 } },
        query: mockQuery,
      });
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: '99',
          action: 'delete',
        }),
      });
    });

    test('якщо ні результат, ні beforeState не мають id, записує entityId: null', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ status: 'ok' });
      await allOperations({
        model: 'Child',
        operation: 'create',
        args: { data: {} },
        query: mockQuery,
      });
      expect(mockBaseClient.stateHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: null,
        }),
      });
    });
  });

  describe('createClient', () => {
    test('створює клієнт з розширенням без помилок', () => {
      const { createClient } = require('../../src/config/prisma');
      const client = createClient();
      expect(client).toBeDefined();
    });
  });
});
