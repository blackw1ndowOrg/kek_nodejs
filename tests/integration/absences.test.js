const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { absencesRepository } = require('../../src/modules/absences/absences.repository');
const { absencesService } = require('../../src/modules/absences/absences.service');
const { childrenRepository } = require('../../src/modules/children/children.repository');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняються лише репозиторії й поточний момент, тож база не потрібна.

const BASE = '/api/v1/children/5/absences';
const NOW = new Date('2026-11-09T07:00:00+02:00'); // понеділок, 07:00 за Києвом

const tokenFor = (role, id = 12) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const CHILD = { id: 5, isActive: true, discountPercent: 30, hasDeputyRelatives: true };
const ABSENCE = {
  id: 7,
  childId: 5,
  date: new Date('2026-11-12T00:00:00Z'),
  notifiedAt: NOW,
};

describe('Absences API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(absencesService, 'now').mockReturnValue(NOW);
    jest.spyOn(childrenRepository, 'findById').mockResolvedValue(CHILD);
    jest.spyOn(absencesRepository, 'create').mockResolvedValue(ABSENCE);
    jest.spyOn(absencesRepository, 'findByChild').mockResolvedValue([ABSENCE]);
    jest.spyOn(absencesRepository, 'findById').mockResolvedValue(ABSENCE);
    jest.spyOn(absencesRepository, 'delete').mockResolvedValue(undefined);
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
      ['post', BASE],
      ['get', BASE],
      ['delete', `${BASE}/7`],
    ])('вихователь (TEACHER): %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test('батько шукає дитину лише серед своїх: чужа -> 404', async () => {
      childrenRepository.findById.mockResolvedValueOnce(null);
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('PARENT'))
        .send({ date: '2026-11-12' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(childrenRepository.findById).toHaveBeenCalledWith(5, 12);
      expect(absencesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /children/:childId/absences', () => {
    test.each(['PARENT', 'ADMIN', 'MANAGER'])('%s: 201, notifiedAt від сервера', async (role) => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor(role))
        .send({ date: '2026-11-12' });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({
        id: 7,
        childId: 5,
        date: '2026-11-12',
        notifiedAt: NOW.toISOString(),
        counted: true,
      });
      expect(absencesRepository.create).toHaveBeenCalledWith({
        childId: 5,
        date: '2026-11-12',
        notifiedAt: NOW,
      });
    });

    test('у відповіді немає знижки й кумівства дитини', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('PARENT'))
        .send({ date: '2026-11-12' });
      expect(res.body).not.toHaveProperty('discountPercent');
      expect(res.body).not.toHaveProperty('hasDeputyRelatives');
    });

    test('дубль на ту саму дату -> 409', async () => {
      absencesRepository.create.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' })
      );
      const res = await request(app)
        .post(BASE)
        .set('Authorization', tokenFor('PARENT'))
        .send({ date: '2026-11-12' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    });

    test.each([
      ['вихідний', { date: '2026-11-14' }, ErrorCodes.BAD_REQUEST],
      ['дата в минулому', { date: '2026-11-06' }, ErrorCodes.BAD_REQUEST],
      ['не дата', { date: '12.11.2026' }, ErrorCodes.VALIDATION_ERROR],
      [
        'notifiedAt від клієнта',
        { date: '2026-11-12', notifiedAt: NOW },
        ErrorCodes.VALIDATION_ERROR,
      ],
    ])('%s -> 400', async (_name, body, code) => {
      const res = await request(app).post(BASE).set('Authorization', tokenFor('PARENT')).send(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(code);
      expect(absencesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /children/:childId/absences', () => {
    test('за місяць із counted', async () => {
      const res = await request(app)
        .get(`${BASE}?month=2026-11`)
        .set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({
        childId: 5,
        month: '2026-11',
        countedDays: 1,
        absences: [
          {
            id: 7,
            childId: 5,
            date: '2026-11-12',
            notifiedAt: NOW.toISOString(),
            counted: true,
          },
        ],
      });
    });

    test('без month — поточний місяць', async () => {
      const res = await request(app).get(BASE).set('Authorization', tokenFor('MANAGER'));
      expect(res.body.month).toBe('2026-11');
    });

    test('некоректний month -> 400', async () => {
      const res = await request(app)
        .get(`${BASE}?month=2026-13`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('DELETE /children/:childId/absences/:absenceId', () => {
    test('до 08:30 дня відсутності: 204 без тіла', async () => {
      const res = await request(app).delete(`${BASE}/7`).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.NO_CONTENT);
      expect(res.body).toEqual({});
      expect(absencesRepository.delete).toHaveBeenCalledWith(7);
    });

    test('після 08:30 дня відсутності -> 409', async () => {
      absencesService.now.mockReturnValue(new Date('2026-11-12T09:00:00+02:00'));
      const res = await request(app).delete(`${BASE}/7`).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(absencesRepository.delete).not.toHaveBeenCalled();
    });

    test('відсутність іншої дитини -> 404', async () => {
      absencesRepository.findById.mockResolvedValueOnce({ ...ABSENCE, childId: 6 });
      const res = await request(app).delete(`${BASE}/7`).set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
