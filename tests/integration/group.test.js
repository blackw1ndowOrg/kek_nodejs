const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { groupsRepository } = require('../../src/modules/groups/groups.repository');
const { currentAcademicYear } = require('../../src/domain/age');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняється лише репозиторій, тож база не потрібна.

const BASE = '/api/v1/groups';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const GROUP = { id: 2, name: 'Сонечко', age: 3, roomId: 6, educatorId: null, assistantId: null };

// Сервіс рахує вік від справжньої сьогоднішньої дати, тож дата народження відносна:
// дитині завжди 3 роки на 1 вересня поточного навчального року
const THREE_YEARS_OLD = new Date(`${currentAcademicYear() - 3}-03-15`);

describe('Groups API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest
      .spyOn(groupsRepository, 'findMany')
      .mockResolvedValue([{ ...GROUP, _count: { children: 4 } }]);
    jest.spyOn(groupsRepository, 'findById').mockResolvedValue({ id: 2, children: [] });
    jest.spyOn(groupsRepository, 'findRawById').mockResolvedValue(GROUP);
    jest.spyOn(groupsRepository, 'count').mockResolvedValue(5);
    jest.spyOn(groupsRepository, 'countActiveChildren').mockResolvedValue(0);
    jest
      .spyOn(groupsRepository, 'findRoom')
      .mockResolvedValue({ id: 6, type: 'GROUP', group: null, club: null });
    jest.spyOn(groupsRepository, 'findStaff').mockResolvedValue(null);
    jest.spyOn(groupsRepository, 'findChild').mockResolvedValue({
      id: 5,
      birthDate: THREE_YEARS_OLD,
      isActive: true,
      groupId: null,
    });
    jest.spyOn(groupsRepository, 'create').mockResolvedValue({ ...GROUP, _count: { children: 0 } });
    jest.spyOn(groupsRepository, 'update').mockResolvedValue({ ...GROUP, _count: { children: 0 } });
    jest.spyOn(groupsRepository, 'delete').mockResolvedValue(undefined);
    jest.spyOn(groupsRepository, 'enrollChildIfCapacity').mockResolvedValue(true);
    jest.spyOn(groupsRepository, 'unenrollChild').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('доступ', () => {
    test('без токена -> 401', async () => {
      const res = await request(app).get(BASE);
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test.each([
      ['get', BASE],
      ['get', `${BASE}/2`],
      ['post', BASE],
      ['patch', `${BASE}/2`],
      ['delete', `${BASE}/2`],
      ['post', `${BASE}/2/children`],
      ['delete', `${BASE}/2/children/5`],
    ])('PARENT: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test.each([
      ['post', BASE],
      ['patch', `${BASE}/2`],
      ['delete', `${BASE}/2`],
      ['post', `${BASE}/2/children`],
      ['delete', `${BASE}/2/children/5`],
    ])('TEACHER не змінює групи: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /groups', () => {
    test('менеджер: 200, childrenCount замість _count, вік із query — число', async () => {
      const res = await request(app).get(`${BASE}?age=3`).set('Authorization', tokenFor('MANAGER'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ groups: [{ ...GROUP, childrenCount: 4 }] });
      expect(groupsRepository.findMany).toHaveBeenCalledWith({ age: 3, staffUserId: undefined });
    });

    test('вихователь: лише свої групи', async () => {
      const res = await request(app).get(BASE).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(groupsRepository.findMany).toHaveBeenCalledWith({ staffUserId: 9 });
    });

    test('вік поза 2–5 у фільтрі -> 400', async () => {
      const res = await request(app).get(`${BASE}?age=7`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /groups/:id', () => {
    test('200 з дітьми групи', async () => {
      const res = await request(app).get(`${BASE}/2`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id: 2, children: [] });
    });

    test('чужа група вихователя -> 404', async () => {
      groupsRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).get(`${BASE}/7`).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(groupsRepository.findById).toHaveBeenCalledWith(7, 9);
    });
  });

  describe('POST /groups', () => {
    test('201', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ name: 'Сонечко', age: 3, roomId: 6 });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.childrenCount).toBe(0);
    });

    test('невалідне тіло -> 400', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Сонечко', age: 6, roomId: 6 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('кімната зайнята іншою групою -> 409', async () => {
      groupsRepository.findRoom.mockResolvedValueOnce({
        id: 6,
        type: 'GROUP',
        group: { id: 8 },
        club: null,
      });
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Сонечко', age: 3, roomId: 6 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    });

    test('кімната зайнята гуртком -> 409', async () => {
      groupsRepository.findRoom.mockResolvedValueOnce({
        id: 6,
        type: 'GROUP',
        group: null,
        club: { id: 3 },
      });
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Сонечко', age: 3, roomId: 6 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    });

    test('неіснуючий вихователь -> 404', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Сонечко', age: 3, roomId: 6, educatorId: 77 });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('PATCH /groups/:id', () => {
    test('зняти вихователя: 200', async () => {
      const res = await request(app)
        .patch(`${BASE}/2`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ educatorId: null });
      expect(res.status).toBe(StatusCodes.OK);
      expect(groupsRepository.update).toHaveBeenCalledWith(2, { educatorId: null });
    });

    test('змінити вік групи з дітьми -> 409', async () => {
      groupsRepository.countActiveChildren.mockResolvedValueOnce(3);
      const res = await request(app)
        .patch(`${BASE}/2`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ age: 4 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('DELETE /groups/:id', () => {
    test('порожня група: 204', async () => {
      const res = await request(app).delete(`${BASE}/2`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(groupsRepository.delete).toHaveBeenCalledWith(2);
    });

    test('група з дітьми -> 409', async () => {
      groupsRepository.countActiveChildren.mockResolvedValueOnce(2);
      const res = await request(app).delete(`${BASE}/2`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('зарахування дитини', () => {
    test('POST /groups/:id/children: 204', async () => {
      const res = await request(app)
        .post(`${BASE}/2/children`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ childId: 5 });
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(groupsRepository.enrollChildIfCapacity).toHaveBeenCalledWith(2, 5, 20);
    });

    test('група заповнена -> 409', async () => {
      groupsRepository.enrollChildIfCapacity.mockResolvedValueOnce(false);
      const res = await request(app)
        .post(`${BASE}/2/children`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ childId: 5 });
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });

    test('вік дитини не збігається з віком групи -> 400', async () => {
      groupsRepository.findRawById.mockResolvedValueOnce({ ...GROUP, age: 5 });
      const res = await request(app)
        .post(`${BASE}/2/children`)
        .set('Authorization', tokenFor('MANAGER'))
        .send({ childId: 5 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    });

    test('DELETE /groups/:id/children/:childId: 204', async () => {
      groupsRepository.findChild.mockResolvedValueOnce({ id: 5, isActive: true, groupId: 2 });
      const res = await request(app)
        .delete(`${BASE}/2/children/5`)
        .set('Authorization', tokenFor('MANAGER'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(groupsRepository.unenrollChild).toHaveBeenCalledWith(5);
    });

    test('дитина не з цієї групи -> 404', async () => {
      const res = await request(app)
        .delete(`${BASE}/2/children/5`)
        .set('Authorization', tokenFor('MANAGER'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
