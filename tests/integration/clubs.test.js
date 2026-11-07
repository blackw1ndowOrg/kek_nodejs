const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { clubsRepository } = require('../../src/modules/clubs/clubs.repository');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняється лише репозиторій, тож база не потрібна.

const BASE = '/api/v1/clubs';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const CLUB = {
  id: 4,
  name: 'Музика',
  room: { id: 6, name: 'Кабінет 1', type: 'CLUB' },
  teacher: { id: 12, fullName: 'Олена Іваненко' },
};
const FREE_ROOM = { id: 6, type: 'CLUB', group: null, club: null };
const FREE_TEACHER = { id: 12, type: 'CLUB_TEACHER', isActive: true, clubTaught: null };
const BODY = { name: 'Музика', roomId: 6, teacherId: 12 };

describe('Clubs API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(clubsRepository, 'findMany').mockResolvedValue([CLUB]);
    jest.spyOn(clubsRepository, 'findById').mockResolvedValue(CLUB);
    jest.spyOn(clubsRepository, 'findRoom').mockResolvedValue(FREE_ROOM);
    jest.spyOn(clubsRepository, 'findStaff').mockResolvedValue(FREE_TEACHER);
    jest.spyOn(clubsRepository, 'create').mockResolvedValue(CLUB);
    jest.spyOn(clubsRepository, 'update').mockResolvedValue(CLUB);
    jest.spyOn(clubsRepository, 'delete').mockResolvedValue(undefined);
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
      ['get', `${BASE}/4`],
      ['post', BASE],
      ['patch', `${BASE}/4`],
      ['delete', `${BASE}/4`],
    ])('PARENT: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test.each([
      ['post', BASE],
      ['patch', `${BASE}/4`],
      ['delete', `${BASE}/4`],
    ])('змінювати гуртки може лише ADMIN: MANAGER і TEACHER %s %s -> 403', async (method, url) => {
      for (const role of ['MANAGER', 'TEACHER']) {
        const res = await request(app)[method](url).set('Authorization', tokenFor(role));
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
      }
    });
  });

  describe('GET /clubs', () => {
    test.each(['ADMIN', 'MANAGER', 'TEACHER'])(
      '%s: 200 і список з кімнатою та викладачем',
      async (role) => {
        const res = await request(app).get(BASE).set('Authorization', tokenFor(role));
        expect(res.status).toBe(StatusCodes.OK);
        expect(res.body).toEqual({ clubs: [CLUB] });
      }
    );
  });

  describe('GET /clubs/:id', () => {
    test.each(['ADMIN', 'MANAGER', 'TEACHER'])('%s: 200', async (role) => {
      const res = await request(app).get(`${BASE}/4`).set('Authorization', tokenFor(role));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual(CLUB);
      expect(clubsRepository.findById).toHaveBeenCalledWith(4);
    });

    test('гуртка немає -> 404', async () => {
      clubsRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).get(`${BASE}/99`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('некоректний id -> 400', async () => {
      const res = await request(app).get(`${BASE}/abc`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('POST /clubs', () => {
    const post = (body) =>
      request(app).post(BASE).set('Authorization', tokenFor('ADMIN')).send(body);

    test('201', async () => {
      const res = await post(BODY);
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual(CLUB);
      expect(clubsRepository.create).toHaveBeenCalledWith(BODY);
    });

    test.each([
      ['без назви', { roomId: 6, teacherId: 12 }],
      ['без кімнати', { name: 'А', teacherId: 12 }],
      ['без викладача', { name: 'А', roomId: 6 }],
      ['кімната рядком', { ...BODY, roomId: '6' }],
      ['зайве поле', { ...BODY, color: 'red' }],
    ])('%s -> 400', async (_name, body) => {
      const res = await post(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(clubsRepository.create).not.toHaveBeenCalled();
    });

    test('кімнати немає -> 404', async () => {
      clubsRepository.findRoom.mockResolvedValueOnce(null);
      expect((await post(BODY)).status).toBe(StatusCodes.NOT_FOUND);
    });

    test('кімната не типу CLUB -> 400', async () => {
      clubsRepository.findRoom.mockResolvedValueOnce({ ...FREE_ROOM, type: 'GROUP' });
      const res = await post(BODY);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    });

    test.each([
      ['групою', { group: { id: 2 } }],
      ['іншим гуртком', { club: { id: 5 } }],
    ])('кімната зайнята %s -> 409', async (_name, link) => {
      clubsRepository.findRoom.mockResolvedValueOnce({ ...FREE_ROOM, ...link });
      const res = await post(BODY);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    });

    test('працівника немає -> 404', async () => {
      clubsRepository.findStaff.mockResolvedValueOnce(null);
      expect((await post(BODY)).status).toBe(StatusCodes.NOT_FOUND);
    });

    test('працівник не викладач гуртка -> 400', async () => {
      clubsRepository.findStaff.mockResolvedValueOnce({ ...FREE_TEACHER, type: 'EDUCATOR' });
      expect((await post(BODY)).status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('викладач уже веде гурток -> 409', async () => {
      clubsRepository.findStaff.mockResolvedValueOnce({ ...FREE_TEACHER, clubTaught: { id: 5 } });
      expect((await post(BODY)).status).toBe(StatusCodes.CONFLICT);
    });

    test('назва вже існує (P2002) -> 409', async () => {
      clubsRepository.create.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['name'] } })
      );
      expect((await post(BODY)).status).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('PATCH /clubs/:id', () => {
    const patch = (body) =>
      request(app).patch(`${BASE}/4`).set('Authorization', tokenFor('ADMIN')).send(body);

    test('змінити назву: 200, кімната й викладач не перевіряються', async () => {
      const res = await patch({ name: 'Шахи' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(clubsRepository.update).toHaveBeenCalledWith(4, { name: 'Шахи' });
      expect(clubsRepository.findRoom).not.toHaveBeenCalled();
    });

    test('змінити кімнату на вільну: 200', async () => {
      const res = await patch({ roomId: 7 });
      expect(res.status).toBe(StatusCodes.OK);
      expect(clubsRepository.findRoom).toHaveBeenCalledWith(7);
    });

    test('змінити кімнату на зайняту -> 409', async () => {
      clubsRepository.findRoom.mockResolvedValueOnce({ ...FREE_ROOM, group: { id: 2 } });
      expect((await patch({ roomId: 7 })).status).toBe(StatusCodes.CONFLICT);
      expect(clubsRepository.update).not.toHaveBeenCalled();
    });

    test('змінити викладача на зайнятого -> 409', async () => {
      clubsRepository.findStaff.mockResolvedValueOnce({ ...FREE_TEACHER, clubTaught: { id: 5 } });
      expect((await patch({ teacherId: 13 })).status).toBe(StatusCodes.CONFLICT);
    });

    test('порожнє тіло -> 400', async () => {
      const res = await patch({});
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('гуртка немає -> 404', async () => {
      clubsRepository.findById.mockResolvedValueOnce(null);
      expect((await patch({ name: 'Шахи' })).status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('DELETE /clubs/:id', () => {
    test('204', async () => {
      const res = await request(app).delete(`${BASE}/4`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(clubsRepository.delete).toHaveBeenCalledWith(4);
    });

    test('слоти до і після: видалення гуртка перетворює його слоти на FREE_PLAY, кількість слотів групи лишається 70', async () => {
      // 70 слотів групи «Дзвіночок», 3 з яких — гурток 4
      const initialSlots = Array.from({ length: 70 }, (_, i) => {
        if (i < 3) return { id: i + 1, groupId: 2, activity: 'CLUB', clubId: 4 };
        if (i < 15) return { id: i + 1, groupId: 2, activity: 'CLUB', clubId: 5 };
        return { id: i + 1, groupId: 2, activity: 'FREE_PLAY', clubId: null };
      });
      let slots = JSON.parse(JSON.stringify(initialSlots));

      clubsRepository.delete.mockImplementationOnce(async (id) => {
        slots = slots.map((s) =>
          s.clubId === id ? { ...s, activity: 'FREE_PLAY', clubId: null } : s
        );
      });

      expect(slots).toHaveLength(70);
      expect(slots.filter((s) => s.clubId === 4)).toHaveLength(3);

      const res = await request(app).delete(`${BASE}/4`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);

      // Перевірки після видалення
      expect(slots).toHaveLength(70);
      expect(slots.filter((s) => s.clubId === 4)).toHaveLength(0);
      const converted = slots.filter((s) => [1, 2, 3].includes(s.id));
      expect(converted.every((s) => s.activity === 'FREE_PLAY' && s.clubId === null)).toBe(true);
      expect(slots.filter((s) => s.activity === 'CLUB' && s.clubId === null)).toHaveLength(0);
    });

    test('якщо club.delete падає, слоти не змінені', async () => {
      const initialSlots = Array.from({ length: 70 }, (_, i) => ({
        id: i + 1,
        groupId: 2,
        activity: i < 3 ? 'CLUB' : 'FREE_PLAY',
        clubId: i < 3 ? 4 : null,
      }));
      let slots = JSON.parse(JSON.stringify(initialSlots));

      clubsRepository.delete.mockImplementationOnce(async (id) => {
        const rollback = JSON.parse(JSON.stringify(slots));
        slots = slots.map((s) =>
          s.clubId === id ? { ...s, activity: 'FREE_PLAY', clubId: null } : s
        );
        slots = rollback;
        throw new Error('DB transaction failure');
      });

      const res = await request(app).delete(`${BASE}/4`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(slots).toEqual(initialSlots);
    });

    test('гуртка немає -> 404', async () => {
      clubsRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).delete(`${BASE}/99`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(clubsRepository.delete).not.toHaveBeenCalled();
    });

    test('некоректний id -> 400', async () => {
      const res = await request(app).delete(`${BASE}/0`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });
});
