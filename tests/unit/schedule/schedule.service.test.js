const {
  ScheduleService,
  scheduleService,
  translateDbError,
} = require('../../../src/modules/schedule/schedule.service');
const {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require('../../../src/errors/AppError');
const { validateSchedule } = require('../../../src/domain/schedule');

const ADMIN = { id: 1, role: 'ADMIN' };
const PARENT = { id: 9, role: 'PARENT' };
const TEACHER = { id: 9, role: 'TEACHER' };

const GROUP = { id: 1, name: 'Сонечко', age: 3 };

// заняття групи 1 у понеділок 09:00–09:45 (гурток 11)
const LESSON = {
  id: 100,
  groupId: 1,
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 585,
  activity: 'CLUB',
  clubId: 11,
};
// денний сон тієї самої групи 13:00–14:00
const NAP = {
  id: 101,
  groupId: 1,
  dayOfWeek: 1,
  startMinute: 780,
  endMinute: 840,
  activity: 'SLEEP',
  clubId: null,
};
// інша група, гурток 12 о 09:00
const OTHER_GROUP_LESSON = { ...LESSON, id: 200, groupId: 2, clubId: 12 };

const prismaError = (code) => Object.assign(new Error(code), { code });

function createService({ generator } = {}) {
  const repository = {
    findGroups: jest.fn().mockResolvedValue([1, 2, 3, 4].map((id) => ({ id }))),
    findClubs: jest.fn().mockResolvedValue([11, 12, 13, 14, 15].map((id) => ({ id }))),
    replaceAll: jest.fn(async (slots) => slots.length),
    findAccessibleGroup: jest.fn().mockResolvedValue(GROUP),
    findGroupSlots: jest.fn().mockResolvedValue([LESSON, NAP]),
    findTeacherSlots: jest.fn().mockResolvedValue([LESSON]),
    findSlot: jest.fn().mockResolvedValue(LESSON),
    findClub: jest.fn().mockResolvedValue({ id: 12 }),
    findRelatedSlots: jest.fn().mockResolvedValue([LESSON, NAP]),
    updateSlot: jest.fn().mockResolvedValue({ ...LESSON, startMinute: 600, endMinute: 645 }),
    deleteByGroup: jest.fn().mockResolvedValue(65),
  };
  return { repository, service: new ScheduleService(repository, generator) };
}

describe('translateDbError', () => {
  test.each([
    ['P2002', ConflictError],
    ['P2003', NotFoundError],
    ['P2025', NotFoundError],
  ])('%s -> помилка застосунку', (code, ErrorClass) => {
    expect(translateDbError(prismaError(code))).toBeInstanceOf(ErrorClass);
  });

  test('невідома помилка й null повертаються як є', () => {
    const unknown = new Error('connection lost');
    expect(translateDbError(unknown)).toBe(unknown);
    expect(translateDbError(null)).toBeNull();
  });
});

describe('ScheduleService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(scheduleService).toBeInstanceOf(ScheduleService);
  });

  describe('generate', () => {
    test('генерує розклад усіх груп без накладок кабінетів і зберігає його', async () => {
      const { repository, service } = createService();
      await expect(service.generate()).resolves.toEqual({ groups: 4, clubs: 5, slots: 280 });
      const [slots] = repository.replaceAll.mock.calls[0];
      expect(slots).toHaveLength(4 * 5 * 14);
      expect(validateSchedule(slots)).toEqual([]);
    });

    test('без груп зберігається порожній розклад', async () => {
      const { repository, service } = createService();
      repository.findGroups.mockResolvedValueOnce([]);
      await expect(service.generate()).resolves.toEqual({ groups: 0, clubs: 5, slots: 0 });
      expect(repository.replaceAll).toHaveBeenCalledWith([]);
    });

    test('15 груп і 5 гуртків вміщаються без накладок', async () => {
      const { repository, service } = createService();
      repository.findGroups.mockResolvedValueOnce(
        Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }))
      );
      await expect(service.generate()).resolves.toEqual({ groups: 15, clubs: 5, slots: 1050 });
      const [slots] = repository.replaceAll.mock.calls[0];
      expect(validateSchedule(slots)).toEqual([]);
    });

    test('груп більше, ніж можна розвести за часом -> AppError 422, розклад не чіпається', async () => {
      const { repository, service } = createService();
      repository.findGroups.mockResolvedValueOnce(
        Array.from({ length: 16 }, (_, i) => ({ id: i + 1 }))
      );
      const promise = service.generate();
      await expect(promise).rejects.toBeInstanceOf(AppError);
      await expect(promise).rejects.toMatchObject({ statusCode: 422 });
      await expect(promise).rejects.toThrow(/Груп \(16\) більше, ніж можна розвести за часом/);
      expect(repository.replaceAll).not.toHaveBeenCalled();
    });

    test('менше трьох гуртків -> AppError 422', async () => {
      const { repository, service } = createService();
      repository.findClubs.mockResolvedValueOnce([{ id: 11 }, { id: 12 }]);
      const promise = service.generate();
      await expect(promise).rejects.toMatchObject({ statusCode: 422 });
      await expect(promise).rejects.toThrow(/щонайменше 3 гуртки/);
      expect(repository.replaceAll).not.toHaveBeenCalled();
    });

    test('інша помилка генератора прокидається як є', async () => {
      const boom = new Error('boom');
      const { repository, service } = createService({
        generator: () => {
          throw boom;
        },
      });
      await expect(service.generate()).rejects.toBe(boom);
      expect(repository.replaceAll).not.toHaveBeenCalled();
    });
  });

  describe('getGroupSchedule', () => {
    test('повертає групу та її слоти; доступ перевіряється за користувачем', async () => {
      const { repository, service } = createService();
      await expect(service.getGroupSchedule(PARENT, 1)).resolves.toEqual({
        group: GROUP,
        slots: [LESSON, NAP],
      });
      expect(repository.findAccessibleGroup).toHaveBeenCalledWith(1, PARENT);
      expect(repository.findGroupSlots).toHaveBeenCalledWith(1);
    });

    test('чужа або неіснуюча група -> 404, слоти не читаються', async () => {
      const { repository, service } = createService();
      repository.findAccessibleGroup.mockResolvedValueOnce(null);
      await expect(service.getGroupSchedule(PARENT, 7)).rejects.toThrow(NotFoundError);
      expect(repository.findGroupSlots).not.toHaveBeenCalled();
    });
  });

  test('getMySchedule: заняття залогіненого викладача', async () => {
    const { repository, service } = createService();
    await expect(service.getMySchedule(TEACHER)).resolves.toEqual([LESSON]);
    expect(repository.findTeacherSlots).toHaveBeenCalledWith(9);
  });

  describe('updateSlot', () => {
    test('перенесення у вільний час -> збережено', async () => {
      const { repository, service } = createService();
      const data = { startMinute: 600, endMinute: 645 };
      await expect(service.updateSlot(100, data)).resolves.toMatchObject({ startMinute: 600 });
      expect(repository.findRelatedSlots).toHaveBeenCalledWith(1, 11);
      expect(repository.updateSlot).toHaveBeenCalledWith(100, data);
    });

    test('зсув, що перетинається зі старою позицією цього ж слота, дозволений', async () => {
      const { repository, service } = createService();
      await service.updateSlot(100, { startMinute: 550, endMinute: 595 });
      expect(repository.updateSlot).toHaveBeenCalledWith(100, { startMinute: 550, endMinute: 595 });
    });

    test('слот без гуртка: пошук пов’язаних слотів лише за групою', async () => {
      const { repository, service } = createService();
      repository.findSlot.mockResolvedValueOnce(NAP);
      await service.updateSlot(101, { startMinute: 790, endMinute: 850 });
      expect(repository.findRelatedSlots).toHaveBeenCalledWith(1, null);
    });

    test('зміна гуртка на вільний: перевіряється наявність гуртка й слоти нового гуртка', async () => {
      const { repository, service } = createService();
      await service.updateSlot(100, { clubId: 12 });
      expect(repository.findClub).toHaveBeenCalledWith(12);
      expect(repository.findRelatedSlots).toHaveBeenCalledWith(1, 12);
    });

    test('кабінет зайнятий іншою групою -> 409 CLUB_DOUBLE_BOOKED', async () => {
      const { repository, service } = createService();
      repository.findRelatedSlots.mockResolvedValueOnce([LESSON, NAP, OTHER_GROUP_LESSON]);
      const promise = service.updateSlot(100, { clubId: 12 });
      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow('CLUB_DOUBLE_BOOKED');
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    test('накладка зі слотом тієї самої групи -> 409 GROUP_OVERLAP', async () => {
      const { service, repository } = createService();
      await expect(service.updateSlot(100, { startMinute: 800, endMinute: 845 })).rejects.toThrow(
        'GROUP_OVERLAP'
      );
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    test('слот поза межами дня -> 409 OUT_OF_HOURS', async () => {
      const { service } = createService();
      await expect(service.updateSlot(100, { startMinute: 480, endMinute: 525 })).rejects.toThrow(
        'OUT_OF_HOURS'
      );
    });

    test('початок пізніше за збережений кінець -> 409 INVALID_TIME', async () => {
      const { service } = createService();
      await expect(service.updateSlot(100, { startMinute: 600 })).rejects.toThrow('INVALID_TIME');
    });

    test('той самий гурток двічі за день в однієї групи -> 409 CLUB_REPEATED_IN_DAY', async () => {
      const { repository, service } = createService();
      const sameGroupClub12 = { ...LESSON, id: 201, clubId: 12, startMinute: 840, endMinute: 885 };
      repository.findRelatedSlots.mockResolvedValueOnce([LESSON, NAP, sameGroupClub12]);
      const promise = service.updateSlot(100, { clubId: 12 });
      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow('CLUB_REPEATED_IN_DAY');
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    test('заняття поза періодами 09:00–12:00 / 14:00–17:45 -> 409 LESSON_OUT_OF_WINDOW', async () => {
      const { repository, service } = createService();
      const promise = service.updateSlot(100, { startMinute: 720, endMinute: 750 });
      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow('LESSON_OUT_OF_WINDOW');
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    test('перенесення заняття на післяобідній слот дозволене', async () => {
      const { repository, service } = createService();
      const data = { startMinute: 885, endMinute: 915 };
      await service.updateSlot(100, data);
      expect(repository.updateSlot).toHaveBeenCalledWith(100, data);
    });

    test('чужі існуючі конфлікти не блокують правку', async () => {
      const { repository, service } = createService();
      const first = { ...NAP, id: 300, dayOfWeek: 2, startMinute: 540, endMinute: 585 };
      const second = { ...NAP, id: 301, dayOfWeek: 2, startMinute: 560, endMinute: 600 };
      repository.findRelatedSlots.mockResolvedValueOnce([LESSON, first, second]);
      await expect(
        service.updateSlot(100, { startMinute: 600, endMinute: 645 })
      ).resolves.toBeDefined();
      expect(repository.updateSlot).toHaveBeenCalled();
    });

    test('слота немає -> 404', async () => {
      const { repository, service } = createService();
      repository.findSlot.mockResolvedValueOnce(null);
      await expect(service.updateSlot(999, { startMinute: 600 })).rejects.toThrow(NotFoundError);
      expect(repository.findRelatedSlots).not.toHaveBeenCalled();
    });

    test('гурток можна призначити лише слоту типу CLUB -> 400', async () => {
      const { repository, service } = createService();
      repository.findSlot.mockResolvedValueOnce(NAP);
      await expect(service.updateSlot(101, { clubId: 12 })).rejects.toThrow(BadRequestError);
      expect(repository.findClub).not.toHaveBeenCalled();
    });

    test('нового гуртка не існує -> 404', async () => {
      const { repository, service } = createService();
      repository.findClub.mockResolvedValueOnce(null);
      await expect(service.updateSlot(100, { clubId: 99 })).rejects.toThrow(NotFoundError);
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    test.each([
      ['P2002', ConflictError],
      ['P2003', NotFoundError],
      ['P2025', NotFoundError],
    ])('%s під час запису -> помилка застосунку', async (code, ErrorClass) => {
      const { repository, service } = createService();
      repository.updateSlot.mockRejectedValueOnce(prismaError(code));
      await expect(service.updateSlot(100, { startMinute: 600, endMinute: 645 })).rejects.toThrow(
        ErrorClass
      );
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.updateSlot.mockRejectedValueOnce(unknown);
      await expect(service.updateSlot(100, { startMinute: 600, endMinute: 645 })).rejects.toBe(
        unknown
      );
    });
  });

  describe('clearGroup', () => {
    test('очищає розклад групи; існування групи перевіряється без обмеження доступу', async () => {
      const { repository, service } = createService();
      await expect(service.clearGroup(1)).resolves.toBeUndefined();
      expect(repository.findAccessibleGroup).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ role: 'ADMIN' })
      );
      expect(repository.deleteByGroup).toHaveBeenCalledWith(1);
    });

    test('групи немає -> 404, слоти не видаляються', async () => {
      const { repository, service } = createService();
      repository.findAccessibleGroup.mockResolvedValueOnce(null);
      await expect(service.clearGroup(99)).rejects.toThrow(NotFoundError);
      expect(repository.deleteByGroup).not.toHaveBeenCalled();
    });
  });
});
