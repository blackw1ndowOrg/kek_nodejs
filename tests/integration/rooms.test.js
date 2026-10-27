const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { roomsRepository } = require('../../src/modules/rooms/rooms.repository');
const { settingsService } = require('../../src/modules/settings/settings.service');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняються лише репозиторій і налаштування, тож база не потрібна.

const BASE = '/api/v1/rooms';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const SETTINGS = { DEFAULT_ROOMS_COUNT: 10, ROOM_MONTHLY_COST: 150000 };

const ROOM = {
  id: 6,
  name: 'Кімната 1',
  type: 'GROUP',
  monthlyCost: 150000,
  group: null,
  club: null,
};

describe('Rooms API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(settingsService, 'get').mockImplementation((key) => SETTINGS[key]);
    jest.spyOn(roomsRepository, 'findMany').mockResolvedValue([ROOM]);
    jest.spyOn(roomsRepository, 'count').mockResolvedValue(3);
    jest.spyOn(roomsRepository, 'findById').mockResolvedValue(ROOM);
    jest.spyOn(roomsRepository, 'create').mockResolvedValue(ROOM);
    jest.spyOn(roomsRepository, 'update').mockResolvedValue(ROOM);
    jest.spyOn(roomsRepository, 'delete').mockResolvedValue(undefined);
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
      ['get', `${BASE}/6`],
      ['post', BASE],
      ['patch', `${BASE}/6`],
      ['delete', `${BASE}/6`],
    ])('PARENT: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test.each([
      ['post', BASE],
      ['patch', `${BASE}/6`],
      ['delete', `${BASE}/6`],
    ])('змінювати кімнати може лише ADMIN: MANAGER і TEACHER %s %s -> 403', async (method, url) => {
      for (const role of ['MANAGER', 'TEACHER']) {
        const res = await request(app)[method](url).set('Authorization', tokenFor(role));
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
      }
    });
  });

  describe('GET /rooms', () => {
    test.each(['ADMIN', 'MANAGER', 'TEACHER'])('%s: 200 і список', async (role) => {
      const res = await request(app).get(BASE).set('Authorization', tokenFor(role));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ rooms: [ROOM] });
      expect(roomsRepository.findMany).toHaveBeenCalledWith({ type: undefined });
    });

    test('фільтр за типом', async () => {
      const res = await request(app).get(`${BASE}?type=CLUB`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(roomsRepository.findMany).toHaveBeenCalledWith({ type: 'CLUB' });
    });

    test('невідомий тип у фільтрі -> 400', async () => {
      const res = await request(app).get(`${BASE}?type=OFFICE`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /rooms/:id', () => {
    test.each(['ADMIN', 'MANAGER', 'TEACHER'])('%s: 200', async (role) => {
      const res = await request(app).get(`${BASE}/6`).set('Authorization', tokenFor(role));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual(ROOM);
      expect(roomsRepository.findById).toHaveBeenCalledWith(6);
    });

    test('кімнати немає -> 404', async () => {
      roomsRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).get(`${BASE}/99`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('некоректний id -> 400', async () => {
      const res = await request(app).get(`${BASE}/abc`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('POST /rooms', () => {
    test('201 із зазначеною вартістю', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Кімната 1', type: 'GROUP', monthlyCost: 200000 });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual(ROOM);
      expect(roomsRepository.create).toHaveBeenCalledWith({
        name: 'Кімната 1',
        type: 'GROUP',
        monthlyCost: 200000,
      });
    });

    test('без вартості береться значення з налаштувань', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Кімната 1', type: 'CLUB' });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(roomsRepository.create).toHaveBeenCalledWith({
        name: 'Кімната 1',
        type: 'CLUB',
        monthlyCost: 150000,
      });
    });

    test.each([
      ['без назви', { type: 'GROUP' }],
      ['невідомий тип', { name: 'А', type: 'OFFICE' }],
      ['від’ємна вартість', { name: 'А', type: 'GROUP', monthlyCost: -1 }],
      ['зайве поле', { name: 'А', type: 'GROUP', color: 'red' }],
    ])('%s -> 400', async (_name, body) => {
      const res = await request(app).post(BASE).set('Authorization', tokenFor('ADMIN')).send(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(roomsRepository.create).not.toHaveBeenCalled();
    });

    test('ліміт кількості кімнат -> 409', async () => {
      roomsRepository.count.mockResolvedValueOnce(10);
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'А', type: 'GROUP' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
      expect(roomsRepository.create).not.toHaveBeenCalled();
    });

    test('назва вже існує (P2002) -> 409', async () => {
      roomsRepository.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'А', type: 'GROUP' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });

    test('значення поза діапазоном бази (P2020) -> 400', async () => {
      roomsRepository.create.mockRejectedValueOnce(Object.assign(new Error('range'), { code: 'P2020' }));
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'А', type: 'GROUP' });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('PATCH /rooms/:id', () => {
    test('змінити назву: 200, тип не перевіряється', async () => {
      const res = await request(app)
        .patch(`${BASE}/6`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Нова' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(roomsRepository.update).toHaveBeenCalledWith(6, { name: 'Нова' });
      expect(roomsRepository.findById).not.toHaveBeenCalled();
    });

    test('змінити тип вільної кімнати: 200', async () => {
      const res = await request(app)
        .patch(`${BASE}/6`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ type: 'CLUB' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(roomsRepository.update).toHaveBeenCalledWith(6, { type: 'CLUB' });
    });

    test('змінити тип кімнати, закріпленої за групою -> 409', async () => {
      roomsRepository.findById.mockResolvedValueOnce({ ...ROOM, group: { id: 2, name: 'А' } });
      const res = await request(app)
        .patch(`${BASE}/6`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ type: 'CLUB' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(roomsRepository.update).not.toHaveBeenCalled();
    });

    test('порожнє тіло -> 400', async () => {
      const res = await request(app)
        .patch(`${BASE}/6`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({});
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('кімнати немає (P2025) -> 404', async () => {
      roomsRepository.update.mockRejectedValueOnce(Object.assign(new Error('nf'), { code: 'P2025' }));
      const res = await request(app)
        .patch(`${BASE}/99`)
        .set('Authorization', tokenFor('ADMIN'))
        .send({ name: 'Нова' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('DELETE /rooms/:id', () => {
    test('вільна кімната: 204', async () => {
      const res = await request(app).delete(`${BASE}/6`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(roomsRepository.delete).toHaveBeenCalledWith(6);
    });

    test('кімнати немає -> 404', async () => {
      roomsRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).delete(`${BASE}/99`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test.each([
      ['групою', { group: { id: 2, name: 'А' } }],
      ['гуртком', { club: { id: 4, name: 'Б' } }],
    ])('кімната, закріплена за %s -> 409', async (_name, link) => {
      roomsRepository.findById.mockResolvedValueOnce({ ...ROOM, ...link });
      const res = await request(app).delete(`${BASE}/6`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(roomsRepository.delete).not.toHaveBeenCalled();
    });

    test('некоректний id -> 400', async () => {
      const res = await request(app).delete(`${BASE}/0`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });
});
