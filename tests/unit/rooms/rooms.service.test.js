const {
  RoomsService,
  roomsService,
  translateDbError,
} = require('../../../src/modules/rooms/rooms.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../src/errors/AppError');

const SETTINGS = Object.freeze({ DEFAULT_ROOMS_COUNT: 10, ROOM_MONTHLY_COST: 150000 });

const FREE_ROOM = Object.freeze({
  id: 6,
  name: 'Кімната 1',
  type: 'GROUP',
  monthlyCost: 150000,
  group: null,
  club: null,
});

const prismaError = (code) => Object.assign(new Error(code), { code });

function createService() {
  const repository = {
    findMany: jest.fn().mockResolvedValue([FREE_ROOM]),
    count: jest.fn().mockResolvedValue(3),
    findById: jest.fn().mockResolvedValue(FREE_ROOM),
    create: jest.fn().mockResolvedValue(FREE_ROOM),
    update: jest.fn().mockResolvedValue(FREE_ROOM),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const settings = { get: jest.fn((key) => SETTINGS[key]) };
  const service = new RoomsService(repository, settings);
  return { repository, settings, service };
}

describe('translateDbError', () => {
  test.each([
    ['P2002', ConflictError, 'Кімната з такою назвою вже існує'],
    ['P2003', ConflictError, 'Кімната використовується і не може бути видалена'],
    ['P2020', BadRequestError, 'Значення виходить за межі допустимого діапазону'],
    ['P2025', NotFoundError, 'Кімнату з таким ID не знайдено'],
  ])('%s -> відповідна помилка застосунку', (code, ErrorClass, message) => {
    const result = translateDbError(prismaError(code));
    expect(result).toBeInstanceOf(ErrorClass);
    expect(result.message).toBe(message);
  });

  test('невідома помилка повертається як є', () => {
    const unknown = new Error('connection lost');
    expect(translateDbError(unknown)).toBe(unknown);
    const withOtherCode = prismaError('P9999');
    expect(translateDbError(withOtherCode)).toBe(withOtherCode);
  });

  test.each([null, undefined])('%p повертається як є', (value) => {
    expect(translateDbError(value)).toBe(value);
  });
});

describe('RoomsService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(roomsService).toBeInstanceOf(RoomsService);
  });

  describe('list і getById', () => {
    test('list передає фільтри в репозиторій', async () => {
      const { repository, service } = createService();
      await expect(service.list({ type: 'CLUB' })).resolves.toEqual([FREE_ROOM]);
      expect(repository.findMany).toHaveBeenCalledWith({ type: 'CLUB' });
    });

    test('getById повертає кімнату', async () => {
      const { repository, service } = createService();
      await expect(service.getById(6)).resolves.toBe(FREE_ROOM);
      expect(repository.findById).toHaveBeenCalledWith(6);
    });

    test('кімнати немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.getById(99)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    test('із зазначеною вартістю', async () => {
      const { repository, service } = createService();
      const data = { name: 'А', type: 'GROUP', monthlyCost: 200000 };
      await expect(service.create(data)).resolves.toBe(FREE_ROOM);
      expect(repository.create).toHaveBeenCalledWith(data);
    });

    test('без вартості береться значення з налаштувань', async () => {
      const { repository, settings, service } = createService();
      await service.create({ name: 'А', type: 'GROUP' });
      expect(settings.get).toHaveBeenCalledWith('ROOM_MONTHLY_COST');
      expect(repository.create).toHaveBeenCalledWith({
        name: 'А',
        type: 'GROUP',
        monthlyCost: 150000,
      });
    });

    test('вартість 0 не підміняється значенням із налаштувань', async () => {
      const { repository, service } = createService();
      await service.create({ name: 'А', type: 'GROUP', monthlyCost: 0 });
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ monthlyCost: 0 }));
    });

    test.each([
      ['кількість дорівнює ліміту', 10],
      ['кількість перевищує ліміт', 11],
    ])('%s -> 409', async (_name, count) => {
      const { repository, settings, service } = createService();
      repository.count.mockResolvedValueOnce(count);
      await expect(service.create({ name: 'А', type: 'GROUP' })).rejects.toThrow(ConflictError);
      expect(settings.get).toHaveBeenCalledWith('DEFAULT_ROOMS_COUNT');
      expect(repository.create).not.toHaveBeenCalled();
    });

    test('на одиницю менше за ліміт -> створено', async () => {
      const { repository, service } = createService();
      repository.count.mockResolvedValueOnce(9);
      await expect(service.create({ name: 'А', type: 'GROUP' })).resolves.toBe(FREE_ROOM);
    });

    test.each([
      ['P2002', ConflictError],
      ['P2020', BadRequestError],
    ])('%s з бази перетворюється на помилку застосунку', async (code, ErrorClass) => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError(code));
      await expect(service.create({ name: 'А', type: 'GROUP' })).rejects.toThrow(ErrorClass);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.create.mockRejectedValueOnce(unknown);
      await expect(service.create({ name: 'А', type: 'GROUP' })).rejects.toBe(unknown);
    });
  });

  describe('update', () => {
    test('без зміни типу кімнату наперед не завантажуємо', async () => {
      const { repository, service } = createService();
      await expect(service.update(6, { name: 'Нова' })).resolves.toBe(FREE_ROOM);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(6, { name: 'Нова' });
    });

    test('вільну кімнату можна перевести в інший тип', async () => {
      const { repository, service } = createService();
      await service.update(6, { type: 'CLUB' });
      expect(repository.findById).toHaveBeenCalledWith(6);
      expect(repository.update).toHaveBeenCalledWith(6, { type: 'CLUB' });
    });

    test.each([
      ['групою', { group: { id: 2, name: 'Сонечко' } }],
      ['гуртком', { club: { id: 4, name: 'Малювання' } }],
    ])('зміна типу кімнати, закріпленої за %s -> 409', async (_name, link) => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce({ ...FREE_ROOM, ...link });
      await expect(service.update(6, { type: 'CLUB' })).rejects.toThrow(ConflictError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test('той самий тип для зайнятої кімнати — не конфлікт', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce({ ...FREE_ROOM, group: { id: 2, name: 'А' } });
      await expect(service.update(6, { type: 'GROUP', name: 'Нова' })).resolves.toBe(FREE_ROOM);
      expect(repository.update).toHaveBeenCalledWith(6, { type: 'GROUP', name: 'Нова' });
    });

    test('зміна типу неіснуючої кімнати -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.update(99, { type: 'CLUB' })).rejects.toThrow(NotFoundError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test.each([
      ['P2025', NotFoundError],
      ['P2002', ConflictError],
      ['P2020', BadRequestError],
    ])('%s з бази перетворюється на помилку застосунку', async (code, ErrorClass) => {
      const { repository, service } = createService();
      repository.update.mockRejectedValueOnce(prismaError(code));
      await expect(service.update(6, { name: 'Б' })).rejects.toThrow(ErrorClass);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.update.mockRejectedValueOnce(unknown);
      await expect(service.update(6, { name: 'Б' })).rejects.toBe(unknown);
    });
  });

  describe('remove', () => {
    test('вільна кімната видаляється', async () => {
      const { repository, service } = createService();
      await expect(service.remove(6)).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith(6);
    });

    test('кімнати немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    test.each([
      ['групою', { group: { id: 2, name: 'Сонечко' } }],
      ['гуртком', { club: { id: 4, name: 'Малювання' } }],
    ])('кімната, закріплена за %s -> 409', async (_name, link) => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce({ ...FREE_ROOM, ...link });
      await expect(service.remove(6)).rejects.toThrow(ConflictError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    test.each([
      ['P2003', ConflictError],
      ['P2025', NotFoundError],
    ])('%s з бази під час видалення', async (code, ErrorClass) => {
      const { repository, service } = createService();
      repository.delete.mockRejectedValueOnce(prismaError(code));
      await expect(service.remove(6)).rejects.toThrow(ErrorClass);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.delete.mockRejectedValueOnce(unknown);
      await expect(service.remove(6)).rejects.toBe(unknown);
    });
  });
});
