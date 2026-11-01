const {
  ClubsService,
  clubsService,
  translateDbError,
} = require('../../../src/modules/clubs/clubs.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../src/errors/AppError');

const CLUB = Object.freeze({
  id: 4,
  name: 'Музика',
  room: { id: 6, name: 'Кабінет 1', type: 'CLUB' },
  teacher: { id: 12, fullName: 'Олена Іваненко' },
});
const FREE_ROOM = { id: 6, type: 'CLUB', group: null, club: null };
const FREE_TEACHER = { id: 12, type: 'CLUB_TEACHER', isActive: true, clubTaught: null };
const DATA = { name: 'Музика', roomId: 6, teacherId: 12 };

const prismaError = (code, meta) => Object.assign(new Error(code), { code, meta });

function createService() {
  const repository = {
    findMany: jest.fn().mockResolvedValue([CLUB]),
    findById: jest.fn().mockResolvedValue(CLUB),
    findRoom: jest.fn().mockResolvedValue(FREE_ROOM),
    findStaff: jest.fn().mockResolvedValue(FREE_TEACHER),
    create: jest.fn().mockResolvedValue(CLUB),
    update: jest.fn().mockResolvedValue(CLUB),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return { repository, service: new ClubsService(repository) };
}

describe('translateDbError', () => {
  test.each([
    [['name'], 'Гурток з такою назвою вже існує'],
    [['roomId'], 'Кімната вже закріплена за іншим гуртком'],
    ['Club_teacherId_key', 'Викладач вже веде інший гурток'],
    [undefined, 'Гурток з такою назвою вже існує'],
  ])('P2002 з target %p -> конфлікт «%s»', (target, message) => {
    const result = translateDbError(prismaError('P2002', target ? { target } : undefined));
    expect(result).toBeInstanceOf(ConflictError);
    expect(result.message).toBe(message);
  });

  test('P2003 -> 404 про кімнату або викладача', () => {
    const result = translateDbError(prismaError('P2003'));
    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.message).toBe('Кімнату або викладача не знайдено');
  });

  test('P2025 -> 404 про гурток', () => {
    const result = translateDbError(prismaError('P2025'));
    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.message).toBe('Гурток не знайдено');
  });

  test('невідома помилка, null і undefined повертаються як є', () => {
    const unknown = new Error('connection lost');
    expect(translateDbError(unknown)).toBe(unknown);
    expect(translateDbError(null)).toBeNull();
    expect(translateDbError(undefined)).toBeUndefined();
  });
});

describe('ClubsService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(clubsService).toBeInstanceOf(ClubsService);
  });

  describe('list і getById', () => {
    test('list повертає гуртки', async () => {
      const { service } = createService();
      await expect(service.list()).resolves.toEqual([CLUB]);
    });

    test('getById повертає гурток', async () => {
      const { repository, service } = createService();
      await expect(service.getById(4)).resolves.toBe(CLUB);
      expect(repository.findById).toHaveBeenCalledWith(4);
    });

    test('гуртка немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.getById(99)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    test('кімната й викладач вільні -> гурток створено', async () => {
      const { repository, service } = createService();
      await expect(service.create(DATA)).resolves.toBe(CLUB);
      expect(repository.findRoom).toHaveBeenCalledWith(6);
      expect(repository.findStaff).toHaveBeenCalledWith(12);
      expect(repository.create).toHaveBeenCalledWith(DATA);
    });

    test.each([
      ['кімнати немає', null, NotFoundError],
      ['кімната групи', { ...FREE_ROOM, type: 'GROUP' }, BadRequestError],
      ['кімнату займає група', { ...FREE_ROOM, group: { id: 2 } }, ConflictError],
      ['кімнату займає інший гурток', { ...FREE_ROOM, club: { id: 5 } }, ConflictError],
    ])('%s', async (_name, room, ErrorClass) => {
      const { repository, service } = createService();
      repository.findRoom.mockResolvedValueOnce(room);
      await expect(service.create(DATA)).rejects.toThrow(ErrorClass);
      expect(repository.findStaff).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    test.each([
      ['працівника немає', null, NotFoundError],
      ['не викладач гуртка', { ...FREE_TEACHER, type: 'EDUCATOR' }, BadRequestError],
      ['звільнений', { ...FREE_TEACHER, isActive: false }, BadRequestError],
      ['вже веде інший гурток', { ...FREE_TEACHER, clubTaught: { id: 5 } }, ConflictError],
    ])('викладач: %s', async (_name, staff, ErrorClass) => {
      const { repository, service } = createService();
      repository.findStaff.mockResolvedValueOnce(staff);
      await expect(service.create(DATA)).rejects.toThrow(ErrorClass);
      expect(repository.create).not.toHaveBeenCalled();
    });

    test.each([
      [prismaError('P2002', { target: ['name'] }), ConflictError],
      [prismaError('P2003'), NotFoundError],
    ])('помилка бази %#', async (error, ErrorClass) => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(error);
      await expect(service.create(DATA)).rejects.toThrow(ErrorClass);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.create.mockRejectedValueOnce(unknown);
      await expect(service.create(DATA)).rejects.toBe(unknown);
    });
  });

  describe('update', () => {
    test('змінюється лише назва: кімнату й викладача не перевіряємо', async () => {
      const { repository, service } = createService();
      await expect(service.update(4, { name: 'Шахи' })).resolves.toBe(CLUB);
      expect(repository.findRoom).not.toHaveBeenCalled();
      expect(repository.findStaff).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(4, { name: 'Шахи' });
    });

    test('та сама кімната й той самий викладач — без перевірок', async () => {
      const { repository, service } = createService();
      await service.update(4, { roomId: 6, teacherId: 12 });
      expect(repository.findRoom).not.toHaveBeenCalled();
      expect(repository.findStaff).not.toHaveBeenCalled();
    });

    test('нова вільна кімната й новий вільний викладач', async () => {
      const { repository, service } = createService();
      await service.update(4, { roomId: 7, teacherId: 13 });
      expect(repository.findRoom).toHaveBeenCalledWith(7);
      expect(repository.findStaff).toHaveBeenCalledWith(13);
      expect(repository.update).toHaveBeenCalledWith(4, { roomId: 7, teacherId: 13 });
    });

    test('нова кімната зайнята -> 409, гурток не змінюється', async () => {
      const { repository, service } = createService();
      repository.findRoom.mockResolvedValueOnce({ ...FREE_ROOM, group: { id: 2 } });
      await expect(service.update(4, { roomId: 7 })).rejects.toThrow(ConflictError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test('новий викладач уже веде гурток -> 409', async () => {
      const { repository, service } = createService();
      repository.findStaff.mockResolvedValueOnce({ ...FREE_TEACHER, clubTaught: { id: 5 } });
      await expect(service.update(4, { teacherId: 13 })).rejects.toThrow(ConflictError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test('гуртка немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.update(99, { name: 'А' })).rejects.toThrow(NotFoundError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test.each([
      [prismaError('P2025'), NotFoundError],
      [prismaError('P2002', { target: ['name'] }), ConflictError],
    ])('помилка бази %#', async (error, ErrorClass) => {
      const { repository, service } = createService();
      repository.update.mockRejectedValueOnce(error);
      await expect(service.update(4, { name: 'Б' })).rejects.toThrow(ErrorClass);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.update.mockRejectedValueOnce(unknown);
      await expect(service.update(4, { name: 'Б' })).rejects.toBe(unknown);
    });
  });

  describe('remove', () => {
    test('гурток видаляється', async () => {
      const { repository, service } = createService();
      await expect(service.remove(4)).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith(4);
    });

    test('гуртка немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    test('P2025 під час видалення (гонка) -> 404', async () => {
      const { repository, service } = createService();
      repository.delete.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.remove(4)).rejects.toThrow(NotFoundError);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.delete.mockRejectedValueOnce(unknown);
      await expect(service.remove(4)).rejects.toBe(unknown);
    });
  });
});
