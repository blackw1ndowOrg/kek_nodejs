const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { validateSchedule } = require('../../src/domain/schedule');
const { scheduleRepository } = require('../../src/modules/schedule/schedule.repository');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Генератор і валідатор справжні, підміняється лише репозиторій.

const BASE = '/api/v1/schedule';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const GROUP = { id: 2, name: 'Сонечко', age: 3 };
const LESSON = {
  id: 100,
  groupId: 2,
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 585,
  activity: 'CLUB',
  clubId: 11,
};
const NAP = {
  id: 101,
  groupId: 2,
  dayOfWeek: 1,
  startMinute: 780,
  endMinute: 840,
  activity: 'SLEEP',
  clubId: null,
};
const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe('Schedule API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(scheduleRepository, 'findGroups').mockResolvedValue(ids(4));
    jest.spyOn(scheduleRepository, 'findClubs').mockResolvedValue(ids(5, 11));
    jest.spyOn(scheduleRepository, 'replaceAll').mockImplementation(async (slots) => slots.length);
    jest.spyOn(scheduleRepository, 'findAccessibleGroup').mockResolvedValue(GROUP);
    jest.spyOn(scheduleRepository, 'findGroupSlots').mockResolvedValue([LESSON, NAP]);
    jest.spyOn(scheduleRepository, 'findTeacherSlots').mockResolvedValue([LESSON]);
    jest.spyOn(scheduleRepository, 'findSlot').mockResolvedValue(LESSON);
    jest.spyOn(scheduleRepository, 'findClub').mockResolvedValue({ id: 12 });
    jest.spyOn(scheduleRepository, 'findRelatedSlots').mockResolvedValue([LESSON, NAP]);
    jest
      .spyOn(scheduleRepository, 'updateSlot')
      .mockResolvedValue({ ...LESSON, startMinute: 600, endMinute: 645 });
    jest.spyOn(scheduleRepository, 'deleteByGroup').mockResolvedValue(65);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('доступ', () => {
    test('без токена -> 401', async () => {
      const res = await request(app).get(`${BASE}/groups/2`);
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test.each([
      ['post', `${BASE}/generate`],
      ['patch', `${BASE}/slots/100`],
      ['delete', `${BASE}/groups/2`],
    ])('%s %s: лише ADMIN, решта -> 403', async (method, url) => {
      for (const role of ['MANAGER', 'TEACHER', 'PARENT']) {
        const res = await request(app)[method](url).set('Authorization', tokenFor(role)).send({});
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
      }
    });

    test.each(['ADMIN', 'MANAGER', 'PARENT'])(
      'GET /my доступний лише TEACHER: %s -> 403',
      async (role) => {
        const res = await request(app).get(`${BASE}/my`).set('Authorization', tokenFor(role));
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
      }
    );
  });

  describe('POST /schedule/generate', () => {
    test('201: розклад для всіх груп без колізій кабінетів', async () => {
      const res = await request(app)
        .post(`${BASE}/generate`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ groups: 4, clubs: 5, slots: 260 });
      const [slots] = scheduleRepository.replaceAll.mock.calls[0];
      expect(validateSchedule(slots)).toEqual([]);
    });

    test('груп більше, ніж гуртків -> 422', async () => {
      scheduleRepository.findGroups.mockResolvedValueOnce(ids(6));
      const res = await request(app)
        .post(`${BASE}/generate`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(422);
      expect(scheduleRepository.replaceAll).not.toHaveBeenCalled();
    });
  });

  describe('GET /schedule/groups/:groupId', () => {
    test.each(['ADMIN', 'MANAGER', 'TEACHER', 'PARENT'])('%s: 200 і слоти групи', async (role) => {
      const res = await request(app).get(`${BASE}/groups/2`).set('Authorization', tokenFor(role));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ group: GROUP, slots: [LESSON, NAP] });
    });

    test('доступ перевіряється за користувачем', async () => {
      await request(app).get(`${BASE}/groups/2`).set('Authorization', tokenFor('PARENT', 15));
      expect(scheduleRepository.findAccessibleGroup).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ id: 15, role: 'PARENT' })
      );
    });

    test('чужа група -> 404', async () => {
      scheduleRepository.findAccessibleGroup.mockResolvedValueOnce(null);
      const res = await request(app)
        .get(`${BASE}/groups/7`)
        .set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('некоректний id -> 400', async () => {
      const res = await request(app)
        .get(`${BASE}/groups/abc`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /schedule/my', () => {
    test('викладач: 200 і його заняття', async () => {
      const res = await request(app).get(`${BASE}/my`).set('Authorization', tokenFor('TEACHER', 9));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ slots: [LESSON] });
      expect(scheduleRepository.findTeacherSlots).toHaveBeenCalledWith(9);
    });
  });

  describe('PATCH /schedule/slots/:id', () => {
    const patch = (body, id = 100) =>
      request(app).patch(`${BASE}/slots/${id}`).set('Authorization', tokenFor('ADMIN')).send(body);

    test('перенесення у вільний час: 200', async () => {
      const res = await patch({ startMinute: 600, endMinute: 645 });
      expect(res.status).toBe(StatusCodes.OK);
      expect(scheduleRepository.updateSlot).toHaveBeenCalledWith(100, {
        startMinute: 600,
        endMinute: 645,
      });
    });

    test('кабінет зайнятий іншою групою -> 409', async () => {
      scheduleRepository.findRelatedSlots.mockResolvedValueOnce([
        LESSON,
        { ...LESSON, id: 200, groupId: 3, clubId: 12 },
      ]);
      const res = await patch({ clubId: 12 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
      expect(scheduleRepository.updateSlot).not.toHaveBeenCalled();
    });

    test('накладка зі сном тієї самої групи -> 409', async () => {
      const res = await patch({ startMinute: 800, endMinute: 845 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });

    test('слота немає -> 404', async () => {
      scheduleRepository.findSlot.mockResolvedValueOnce(null);
      expect((await patch({ startMinute: 600, endMinute: 645 }, 999)).status).toBe(
        StatusCodes.NOT_FOUND
      );
    });

    test('гурток для слота, що не є заняттям -> 400', async () => {
      scheduleRepository.findSlot.mockResolvedValueOnce(NAP);
      const res = await patch({ clubId: 12 }, 101);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    });

    test.each([
      ['порожнє тіло', {}],
      ['невідоме поле', { activity: 'CLUB' }],
      ['день 6', { dayOfWeek: 6 }],
      ['початок не раніше за кінець', { startMinute: 700, endMinute: 600 }],
    ])('%s -> 400', async (_name, body) => {
      const res = await patch(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(scheduleRepository.updateSlot).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /schedule/groups/:groupId', () => {
    test('204: розклад групи очищено', async () => {
      const res = await request(app)
        .delete(`${BASE}/groups/2`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(scheduleRepository.deleteByGroup).toHaveBeenCalledWith(2);
    });

    test('групи немає -> 404', async () => {
      scheduleRepository.findAccessibleGroup.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete(`${BASE}/groups/99`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(scheduleRepository.deleteByGroup).not.toHaveBeenCalled();
    });
  });
});
