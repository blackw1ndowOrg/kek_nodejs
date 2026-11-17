const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { settingsRepository } = require('../../src/modules/settings/settings.repository');
const { settingsService } = require('../../src/modules/settings/settings.service');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняється лише репозиторій; кеш сервісу перед кожним тестом скидається до значень за замовчуванням.

const BASE = '/api/v1/settings';

const tokenFor = (role, id = 1) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const ADMIN = () => tokenFor('ADMIN');

describe('Settings API (Supertest)', () => {
  const app = createApp();

  beforeEach(async () => {
    jest.spyOn(settingsRepository, 'findAll').mockResolvedValue([]);
    jest
      .spyOn(settingsRepository, 'upsert')
      .mockImplementation(async (key, value) => ({ key, value }));
    await settingsService.refresh();
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
      ['get', `${BASE}/TUITION_MONTHLY`],
      ['post', `${BASE}/reload`],
      ['put', `${BASE}/TUITION_MONTHLY`],
      ['patch', `${BASE}/TUITION_MONTHLY`],
      ['patch', `${BASE}/HOLIDAYS`],
    ])('%s %s: лише ADMIN, решта -> 403', async (method, url) => {
      for (const role of ['MANAGER', 'TEACHER', 'PARENT']) {
        const res = await request(app)
          [method](url)
          .set('Authorization', tokenFor(role))
          .send({ value: 1 });
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
      }
    });
  });

  describe('GET /settings', () => {
    test('200 і всі налаштування', async () => {
      const res = await request(app).get(BASE).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.settings).toMatchObject({
        TUITION_MONTHLY: 1500000,
        MAX_GROUPS: 30,
        DISCOUNT_LEVELS: [10, 20, 30],
        WORKING_DAYS_PER_MONTH: 21,
        ATTENDANCE_RATE_PERCENT: 80,
      });
      expect(res.body.settings.HOLIDAYS).toEqual([]);
      expect(Object.keys(res.body.settings)).toHaveLength(19);
    });
  });

  describe('GET /settings/:key', () => {
    test('200: ключ повертається так, як його передали', async () => {
      const res = await request(app).get(`${BASE}/tuitionMonthly`).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ key: 'tuitionMonthly', value: 1500000 });
    });

    test('масив: рівні знижок', async () => {
      const res = await request(app).get(`${BASE}/DISCOUNT_LEVELS`).set('Authorization', ADMIN());
      expect(res.body).toEqual({ key: 'DISCOUNT_LEVELS', value: [10, 20, 30] });
    });

    test('невідомий ключ -> 404', async () => {
      const res = await request(app).get(`${BASE}/NOPE`).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('ключ із недопустимими символами -> 400', async () => {
      const res = await request(app).get(`${BASE}/bad-key`).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe.each(['put', 'patch'])('%s /settings/:key', (method) => {
    test('200: значення збережено й одразу видно в кеші', async () => {
      const res = await request(app)
        [method](`${BASE}/TUITION_MONTHLY`)
        .set('Authorization', ADMIN())
        .send({ value: 1600000 });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ key: 'TUITION_MONTHLY', value: 1600000 });
      expect(settingsRepository.upsert).toHaveBeenCalledWith('tuitionMonthly', 1600000);

      const after = await request(app).get(`${BASE}/TUITION_MONTHLY`).set('Authorization', ADMIN());
      expect(after.body.value).toBe(1600000);
    });

    test('масив рівнів знижок', async () => {
      const res = await request(app)
        [method](`${BASE}/discountLevels`)
        .set('Authorization', ADMIN())
        .send({ value: [5, 15] });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ key: 'DISCOUNT_LEVELS', value: [5, 15] });
    });

    test('свята: список зберігається, і settingsService одразу бачить нові дати', async () => {
      const holidays = ['2026-12-25', '2027-01-01'];
      const res = await request(app)
        [method](`${BASE}/holidays`)
        .set('Authorization', ADMIN())
        .send({ value: holidays });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ key: 'HOLIDAYS', value: holidays });
      expect(settingsRepository.upsert).toHaveBeenCalledWith('holidays', holidays);
      expect(settingsService.get('HOLIDAYS')).toEqual(holidays);
    });

    test('свята: порожній список дозволений (свят немає)', async () => {
      const res = await request(app)
        [method](`${BASE}/HOLIDAYS`)
        .set('Authorization', ADMIN())
        .send({ value: [] });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.value).toEqual([]);
    });

    test.each([
      ['свята: дублікати', 'HOLIDAYS', { value: ['2026-12-25', '2026-12-25'] }],
      ['свята: невалідна дата', 'HOLIDAYS', { value: ['25.12.2026'] }],
      ['свята: неіснуюча дата', 'HOLIDAYS', { value: ['2026-02-29'] }],
      ['свята: числа замість дат', 'HOLIDAYS', { value: [20261225] }],
      ['свята: не масив', 'HOLIDAYS', { value: '2026-12-25' }],
      ['знижка більша за 100', 'YEARLY_DISCOUNT_PERCENT', { value: 101 }],
      ['тариф 0', 'TUITION_MONTHLY', { value: 0 }],
      ['дублікати рівнів', 'DISCOUNT_LEVELS', { value: [10, 10] }],
      ['від’ємне значення', 'TUITION_MONTHLY', { value: -1 }],
      ['значення рядком', 'TUITION_MONTHLY', { value: '100' }],
      ['без value', 'TUITION_MONTHLY', {}],
      ['зайве поле', 'TUITION_MONTHLY', { value: 100, extra: 1 }],
      ['відвідуваність більша за 100', 'ATTENDANCE_RATE_PERCENT', { value: 101 }],
      ['робочих днів 0', 'WORKING_DAYS_PER_MONTH', { value: 0 }],
      ['робочих днів більше 31', 'WORKING_DAYS_PER_MONTH', { value: 32 }],
    ])('%s -> 400', async (_name, key, body) => {
      const res = await request(app)
        [method](`${BASE}/${key}`)
        .set('Authorization', ADMIN())
        .send(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(settingsRepository.upsert).not.toHaveBeenCalled();
    });

    test('невідомий ключ -> 404, база не чіпається', async () => {
      const res = await request(app)
        [method](`${BASE}/NOPE`)
        .set('Authorization', ADMIN())
        .send({ value: 5 });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(settingsRepository.upsert).not.toHaveBeenCalled();
    });

    test('поріг доплати більший за ліміт дітей -> 400', async () => {
      const res = await request(app)
        [method](`${BASE}/GROUP_EXTRA_PAY_THRESHOLD`)
        .set('Authorization', ADMIN())
        .send({ value: 21 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
      expect(settingsRepository.upsert).not.toHaveBeenCalled();
    });

    test('ліміт дітей менший за поріг доплати -> 400', async () => {
      const res = await request(app)
        [method](`${BASE}/MAX_CHILDREN_IN_GROUP`)
        .set('Authorization', ADMIN())
        .send({ value: 11 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /settings/reload', () => {
    test('200: перечитує значення з бази', async () => {
      settingsRepository.findAll.mockResolvedValueOnce([{ key: 'tuitionMonthly', value: 1700000 }]);
      const res = await request(app).post(`${BASE}/reload`).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.settings.TUITION_MONTHLY).toBe(1700000);
      expect(res.body.settings.MAX_GROUPS).toBe(30);
    });

    test('маршрут /reload не плутається з /:key', async () => {
      const res = await request(app).post(`${BASE}/reload`).set('Authorization', ADMIN());
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toHaveProperty('settings');
    });
  });
});
