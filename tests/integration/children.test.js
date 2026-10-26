const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { childrenRepository } = require('../../src/modules/children/children.repository');
const { currentAcademicYear } = require('../../src/domain/age');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняється лише репозиторій, тож база не потрібна.

const BASE = '/api/v1/children';

const tokenFor = (role, id = 12) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const CHILD = {
  id: 5,
  fullName: 'Іван Петренко',
  birthDate: '2022-03-15T00:00:00.000Z',
  notes: null,
  discountPercent: 20,
  paymentPlan: 'MONTHLY',
  hasDeputyRelatives: true,
  paidUntil: null,
  isActive: true,
  groupId: 3,
};

// Сервіс рахує вік від справжньої сьогоднішньої дати, тому дати народження відносні:
// дитині завжди 3 роки (валідно) або 7 (поза межами), хоч би коли запускали тести
const birthYear = (age) => currentAcademicYear() - age;
const NEW_CHILD = { fullName: 'Іван Петренко', birthDate: `${birthYear(3)}-03-15`, parentIds: [7] };

describe('Children API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(childrenRepository, 'findMany').mockResolvedValue([CHILD]);
    jest.spyOn(childrenRepository, 'findById').mockResolvedValue(CHILD);
    jest.spyOn(childrenRepository, 'countParents').mockResolvedValue(1);
    jest.spyOn(childrenRepository, 'create').mockResolvedValue(CHILD);
    jest.spyOn(childrenRepository, 'update').mockResolvedValue(CHILD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('доступ', () => {
    test('без токена -> 401', async () => {
      const res = await request(app).get(BASE);
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
    });

    test.each([
      ['get', BASE],
      ['get', `${BASE}/5`],
      ['post', BASE],
      ['patch', `${BASE}/5`],
      ['delete', `${BASE}/5`],
    ])('TEACHER: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test.each([
      ['post', BASE],
      ['delete', `${BASE}/5`],
    ])('PARENT: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /children', () => {
    test('менеджер: 200, фільтри з query перетворені на число й boolean', async () => {
      const res = await request(app)
        .get(`${BASE}?groupId=3&isActive=false`)
        .set('Authorization', tokenFor('MANAGER', 2));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ children: [CHILD] });
      expect(childrenRepository.findMany).toHaveBeenCalledWith({
        groupId: 3,
        isActive: false,
        parentUserId: undefined,
      });
    });

    test('батько: лише свої діти, без знижки й кумівства', async () => {
      const res = await request(app).get(BASE).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(childrenRepository.findMany).toHaveBeenCalledWith({ parentUserId: 12 });
      expect(res.body.children[0]).not.toHaveProperty('discountPercent');
      expect(res.body.children[0]).not.toHaveProperty('hasDeputyRelatives');
    });

    test('невалідний фільтр -> 400', async () => {
      const res = await request(app)
        .get(`${BASE}?isActive=yes`)
        .set('Authorization', tokenFor('ADMIN', 1));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('GET /children/:id', () => {
    test('адмін: 200', async () => {
      const res = await request(app).get(`${BASE}/5`).set('Authorization', tokenFor('ADMIN', 1));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ child: CHILD });
      expect(childrenRepository.findById).toHaveBeenCalledWith(5, undefined);
    });

    test('чужа або неіснуюча дитина -> 404', async () => {
      childrenRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app).get(`${BASE}/99`).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    });

    test('невалідний id -> 400', async () => {
      const res = await request(app).get(`${BASE}/abc`).set('Authorization', tokenFor('ADMIN', 1));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /children', () => {
    test('менеджер: 201, дата з рядка стала Date', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('MANAGER', 2))
        .send(NEW_CHILD);
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ child: CHILD });
      const [data, parentIds] = childrenRepository.create.mock.calls[0];
      expect(data.birthDate).toBeInstanceOf(Date);
      expect(parentIds).toEqual([7]);
    });

    test('невалідне тіло -> 400', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('MANAGER', 2))
        .send({ ...NEW_CHILD, groupId: 1 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('вік поза 2–5 -> 400', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('MANAGER', 2))
        .send({ ...NEW_CHILD, birthDate: `${birthYear(7)}-03-15` });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    });

    test('менеджер зі знижкою -> 403', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('MANAGER', 2))
        .send({ ...NEW_CHILD, discountPercent: 10 });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test('неіснуючий батько -> 404', async () => {
      childrenRepository.countParents.mockResolvedValueOnce(0);
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('ADMIN', 1))
        .send(NEW_CHILD);
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('PATCH /children/:id', () => {
    test('батько змінює notes своєї дитини: 200', async () => {
      const res = await request(app)
        .patch(`${BASE}/5`)
        .set('Authorization', tokenFor('PARENT'))
        .send({ notes: 'не любить гречку' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(childrenRepository.update).toHaveBeenCalledWith(5, { notes: 'не любить гречку' });
      expect(res.body.child).not.toHaveProperty('discountPercent');
    });

    test('батько змінює інше поле -> 403', async () => {
      const res = await request(app)
        .patch(`${BASE}/5`)
        .set('Authorization', tokenFor('PARENT'))
        .send({ fullName: 'Інше' });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test('порожнє тіло -> 400', async () => {
      const res = await request(app)
        .patch(`${BASE}/5`)
        .set('Authorization', tokenFor('ADMIN', 1))
        .send({});
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('DELETE /children/:id', () => {
    test('менеджер: 204 без тіла, дитина деактивована', async () => {
      const res = await request(app)
        .delete(`${BASE}/5`)
        .set('Authorization', tokenFor('MANAGER', 2));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(res.body).toEqual({});
      expect(childrenRepository.update).toHaveBeenCalledWith(5, { isActive: false });
    });

    test('неіснуюча дитина -> 404', async () => {
      childrenRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete(`${BASE}/99`)
        .set('Authorization', tokenFor('ADMIN', 1));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
