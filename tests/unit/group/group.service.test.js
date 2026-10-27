const { GroupsService, groupsService } = require('../../../src/modules/groups/groups.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../src/errors/AppError');

const ADMIN = { id: 1, role: 'ADMIN' };
const TEACHER = { id: 9, role: 'TEACHER' };

// 26.10.2026 -> вік рахується на 01.09.2026
const TODAY = new Date('2026-10-26T10:00:00Z');

const GROUP = Object.freeze({
  id: 2,
  name: 'Сонечко',
  age: 3,
  roomId: 6,
  educatorId: 1,
  assistantId: null,
});
const SUMMARY_FROM_DB = Object.freeze({ ...GROUP, _count: { children: 4 } });
const SETTINGS = Object.freeze({ MAX_GROUPS: 30, MAX_CHILDREN_IN_GROUP: 20 });

const FREE_ROOM = { id: 6, type: 'GROUP', group: null, club: null };
const FREE_EDUCATOR = {
  id: 1,
  type: 'EDUCATOR',
  isActive: true,
  educatorOf: null,
  assistantOf: null,
};
const FREE_ASSISTANT = {
  id: 3,
  type: 'ASSISTANT',
  isActive: true,
  educatorOf: null,
  assistantOf: null,
};
const CHILD_3_YEARS = { id: 5, birthDate: new Date('2023-03-15'), isActive: true, groupId: null };

function createService() {
  const repository = {
    findMany: jest.fn().mockResolvedValue([SUMMARY_FROM_DB]),
    findById: jest.fn().mockResolvedValue({ id: 2, children: [] }),
    findRawById: jest.fn().mockResolvedValue(GROUP),
    count: jest.fn().mockResolvedValue(5),
    countActiveChildren: jest.fn().mockResolvedValue(0),
    findRoom: jest.fn().mockResolvedValue(FREE_ROOM),
    findStaff: jest
      .fn()
      .mockImplementation(async (id) => (id === 3 ? FREE_ASSISTANT : FREE_EDUCATOR)),
    findChild: jest.fn().mockResolvedValue(CHILD_3_YEARS),
    create: jest.fn().mockResolvedValue(SUMMARY_FROM_DB),
    update: jest.fn().mockResolvedValue(SUMMARY_FROM_DB),
    delete: jest.fn().mockResolvedValue(undefined),
    enrollChildIfCapacity: jest.fn().mockResolvedValue(true),
    unenrollChild: jest.fn().mockResolvedValue(undefined),
  };
  const settings = { get: jest.fn((key) => SETTINGS[key]) };
  const service = new GroupsService(repository, settings, () => TODAY);
  return { repository, settings, service };
}

const SUMMARY = { ...GROUP, childrenCount: 4 };

describe('GroupsService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(groupsService).toBeInstanceOf(GroupsService);
    expect(groupsService.now()).toBeInstanceOf(Date);
  });

  describe('list і getById', () => {
    test('адмін бачить усі групи; _count перетворено на childrenCount', async () => {
      const { repository, service } = createService();
      await expect(service.list(ADMIN, { age: 3 })).resolves.toEqual([SUMMARY]);
      expect(repository.findMany).toHaveBeenCalledWith({ age: 3, staffUserId: undefined });
    });

    test('вихователь — лише свої групи', async () => {
      const { repository, service } = createService();
      await service.list(TEACHER);
      expect(repository.findMany).toHaveBeenCalledWith({ staffUserId: 9 });
      await service.getById(TEACHER, 2);
      expect(repository.findById).toHaveBeenCalledWith(2, 9);
    });

    test('адмін отримує групу за id', async () => {
      const { repository, service } = createService();
      await expect(service.getById(ADMIN, 2)).resolves.toEqual({ id: 2, children: [] });
      expect(repository.findById).toHaveBeenCalledWith(2, undefined);
    });

    test('чужа або неіснуюча група -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.getById(TEACHER, 7)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    const data = { name: 'Сонечко', age: 3, roomId: 6, educatorId: 1, assistantId: 3 };

    test('усе вільне -> група створена', async () => {
      const { repository, service } = createService();
      await expect(service.create(data)).resolves.toEqual(SUMMARY);
      expect(repository.findRoom).toHaveBeenCalledWith(6);
      expect(repository.findStaff).toHaveBeenCalledWith(1);
      expect(repository.findStaff).toHaveBeenCalledWith(3);
      expect(repository.create).toHaveBeenCalledWith(data);
    });

    test('без персоналу персонал не перевіряється', async () => {
      const { repository, service } = createService();
      await service.create({ name: 'А', age: 3, roomId: 6 });
      expect(repository.findStaff).not.toHaveBeenCalled();
    });

    test('ліміт груп із налаштувань -> 409', async () => {
      const { repository, service } = createService();
      repository.count.mockResolvedValueOnce(30);
      await expect(service.create(data)).rejects.toThrow(ConflictError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    test.each([
      ['кімнати немає', null, NotFoundError],
      ['кімната гуртка', { id: 6, type: 'CLUB', group: null, club: null }, BadRequestError],
      [
        'кімнату займає гурток',
        { id: 6, type: 'GROUP', group: null, club: { id: 4 } },
        ConflictError,
      ],
      [
        'кімнату займає інша група',
        { id: 6, type: 'GROUP', group: { id: 8 }, club: null },
        ConflictError,
      ],
    ])('%s', async (_name, room, ErrorClass) => {
      const { repository, service } = createService();
      repository.findRoom.mockResolvedValueOnce(room);
      await expect(service.create(data)).rejects.toThrow(ErrorClass);
    });

    test.each([
      ['працівника немає', null, NotFoundError],
      ['не вихователь', { ...FREE_EDUCATOR, type: 'CLUB_TEACHER' }, BadRequestError],
      ['звільнений', { ...FREE_EDUCATOR, isActive: false }, BadRequestError],
      ['вже вихователь іншої групи', { ...FREE_EDUCATOR, educatorOf: { id: 8 } }, ConflictError],
    ])('вихователь: %s', async (_name, staff, ErrorClass) => {
      const { repository, service } = createService();
      repository.findStaff.mockResolvedValueOnce(staff);
      await expect(service.create(data)).rejects.toThrow(ErrorClass);
    });

    test('помічника перевіряє поле assistantOf', async () => {
      const { repository, service } = createService();
      repository.findStaff.mockImplementation(async (id) =>
        id === 3 ? { ...FREE_ASSISTANT, assistantOf: { id: 8 } } : FREE_EDUCATOR
      );
      await expect(service.create(data)).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    test('та сама кімната й той самий вихователь цієї групи — не конфлікт', async () => {
      const { repository, service } = createService();
      repository.findRoom.mockResolvedValueOnce({
        id: 6,
        type: 'GROUP',
        group: { id: 2 },
        club: null,
      });
      repository.findStaff.mockResolvedValueOnce({ ...FREE_EDUCATOR, educatorOf: { id: 2 } });
      await expect(service.update(2, { roomId: 6, educatorId: 1 })).resolves.toEqual(SUMMARY);
    });

    test('зняти вихователя (null) — без перевірки персоналу', async () => {
      const { repository, service } = createService();
      await service.update(2, { educatorId: null });
      expect(repository.findStaff).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(2, { educatorId: null });
    });

    test('неіснуюча група -> 404', async () => {
      const { repository, service } = createService();
      repository.findRawById.mockResolvedValueOnce(null);
      await expect(service.update(99, { name: 'А' })).rejects.toThrow(NotFoundError);
    });

    test('вік порожньої групи змінюється', async () => {
      const { repository, service } = createService();
      await service.update(2, { age: 4 });
      expect(repository.update).toHaveBeenCalledWith(2, { age: 4 });
    });

    test('вік групи з дітьми не змінюється -> 409', async () => {
      const { repository, service } = createService();
      repository.countActiveChildren.mockResolvedValueOnce(3);
      await expect(service.update(2, { age: 4 })).rejects.toThrow(ConflictError);
    });

    test('той самий вік — дітей не рахуємо', async () => {
      const { repository, service } = createService();
      await service.update(2, { age: 3 });
      expect(repository.countActiveChildren).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    test('порожня група видаляється', async () => {
      const { repository, service } = createService();
      await expect(service.delete(2)).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith(2);
    });

    test('група з активними дітьми -> 409', async () => {
      const { repository, service } = createService();
      repository.countActiveChildren.mockResolvedValueOnce(1);
      await expect(service.delete(2)).rejects.toThrow(ConflictError);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('enrollChild', () => {
    test('вік збігається, місце є -> зараховано з лімітом із налаштувань', async () => {
      const { repository, settings, service } = createService();
      await expect(service.enrollChild(2, 5)).resolves.toBeUndefined();
      expect(settings.get).toHaveBeenCalledWith('MAX_CHILDREN_IN_GROUP');
      expect(repository.enrollChildIfCapacity).toHaveBeenCalledWith(2, 5, 20);
    });

    test('переведення з іншої групи дозволене', async () => {
      const { repository, service } = createService();
      repository.findChild.mockResolvedValueOnce({ ...CHILD_3_YEARS, groupId: 8 });
      await expect(service.enrollChild(2, 5)).resolves.toBeUndefined();
    });

    test.each([
      ['дитини немає', null, NotFoundError],
      ['дитина неактивна', { ...CHILD_3_YEARS, isActive: false }, BadRequestError],
      ['вже в цій групі', { ...CHILD_3_YEARS, groupId: 2 }, ConflictError],
      ['інший вік', { ...CHILD_3_YEARS, birthDate: new Date('2022-03-15') }, BadRequestError],
    ])('%s', async (_name, child, ErrorClass) => {
      const { repository, service } = createService();
      repository.findChild.mockResolvedValueOnce(child);
      await expect(service.enrollChild(2, 5)).rejects.toThrow(ErrorClass);
      expect(repository.enrollChildIfCapacity).not.toHaveBeenCalled();
    });

    test('група заповнена -> 409', async () => {
      const { repository, service } = createService();
      repository.enrollChildIfCapacity.mockResolvedValueOnce(false);
      await expect(service.enrollChild(2, 5)).rejects.toThrow(ConflictError);
    });

    test('неіснуюча група -> 404', async () => {
      const { repository, service } = createService();
      repository.findRawById.mockResolvedValueOnce(null);
      await expect(service.enrollChild(99, 5)).rejects.toThrow(NotFoundError);
    });
  });

  describe('unenrollChild', () => {
    test('дитину з цієї групи знято', async () => {
      const { repository, service } = createService();
      repository.findChild.mockResolvedValueOnce({ ...CHILD_3_YEARS, groupId: 2 });
      await expect(service.unenrollChild(2, 5)).resolves.toBeUndefined();
      expect(repository.unenrollChild).toHaveBeenCalledWith(5);
    });

    test.each([
      ['дитини немає', null],
      ['дитина в іншій групі', { ...CHILD_3_YEARS, groupId: 8 }],
    ])('%s -> 404', async (_name, child) => {
      const { repository, service } = createService();
      repository.findChild.mockResolvedValueOnce(child);
      await expect(service.unenrollChild(2, 5)).rejects.toThrow(NotFoundError);
      expect(repository.unenrollChild).not.toHaveBeenCalled();
    });
  });

  describe('помилки бази між перевіркою й записом', () => {
    const prismaError = (code) => Object.assign(new Error(code), { code });

    test.each([
      ['P2002', ConflictError],
      ['P2003', NotFoundError],
      ['P2025', NotFoundError],
    ])('%s при створенні', async (code, ErrorClass) => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError(code));
      await expect(service.create({ name: 'А', age: 3, roomId: 6 })).rejects.toThrow(ErrorClass);
    });

    test('P2025 при оновленні, видаленні, зарахуванні й відрахуванні -> 404', async () => {
      const { repository, service } = createService();
      repository.update.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.update(2, { name: 'Б' })).rejects.toThrow(NotFoundError);
      repository.delete.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.delete(2)).rejects.toThrow(NotFoundError);
      repository.enrollChildIfCapacity.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.enrollChild(2, 5)).rejects.toThrow(NotFoundError);
      repository.findChild.mockResolvedValueOnce({ ...CHILD_3_YEARS, groupId: 2 });
      repository.unenrollChild.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.unenrollChild(2, 5)).rejects.toThrow(NotFoundError);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.delete.mockRejectedValueOnce(unknown);
      await expect(service.delete(2)).rejects.toBe(unknown);
    });
  });
});
