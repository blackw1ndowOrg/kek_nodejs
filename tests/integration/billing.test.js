jest.mock('../../src/domain/pricing', () => ({
  tuitionMonthly: jest.fn(),
  monthlyTotal: jest.fn(),
  yearlyTotal: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { tuitionMonthly, monthlyTotal, yearlyTotal } = require('../../src/domain/pricing');
const { billingRepository } = require('../../src/modules/billing/billing.repository');
const { settingsService } = require('../../src/modules/settings/settings.service');

// Справжній HTTP-ланцюжок: routes -> auth -> authorize -> validate -> controller -> service.
// Підміняються лише репозиторій, налаштування та формули цін, тож база не потрібна.

const BASE = '/api/v1/billing';

const tokenFor = (role, id = 9) =>
  `Bearer ${jwt.sign({ id, email: `${role.toLowerCase()}@kg.ua`, role }, config.jwtSecret)}`;

const SETTINGS = {
  TUITION_MONTHLY: 300000,
  DISCOUNT_LEVELS: [0, 10, 20],
  MEAL_BASE_PER_DAY: 5000,
  MEAL_PER_EXTRA_YEAR: 500,
  YEARLY_DISCOUNT_PERCENT: 10,
};

const CHILD = {
  id: 5,
  fullName: 'Іван Петренко',
  discountPercent: 10,
  paymentPlan: 'MONTHLY',
  paidUntil: null,
  isActive: true,
  group: { age: 3 },
  parents: [{ parent: { userId: 9 } }],
};

describe('Billing API (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    tuitionMonthly.mockReturnValue(270000);
    monthlyTotal.mockReturnValue(350000);
    yearlyTotal.mockReturnValue(3780000);
    jest.spyOn(settingsService, 'get').mockImplementation((key) => SETTINGS[key]);
    jest.spyOn(billingRepository, 'findChildWithParents').mockResolvedValue(CHILD);
    jest.spyOn(billingRepository, 'updatePaidUntil').mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('доступ', () => {
    test('без токена -> 401', async () => {
      const res = await request(app).get(`${BASE}/children/5`);
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test.each([
      ['get', `${BASE}/children/5`],
      ['post', `${BASE}/children/5/payments`],
    ])('TEACHER: %s %s -> 403', async (method, url) => {
      const res = await request(app)[method](url).set('Authorization', tokenFor('TEACHER'));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /billing/children/:childId', () => {
    test('батько: 200 і розрахунок для своєї дитини', async () => {
      const res = await request(app)
        .get(`${BASE}/children/5`)
        .set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        childId: 5,
        currency: 'UAH',
        groupAge: 3,
        amountDue: 350000,
        paidUntil: null,
        isPaid: false,
      });
      expect(billingRepository.findChildWithParents).toHaveBeenCalledWith(5);
    });

    test.each(['ADMIN', 'MANAGER'])('%s бачить будь-яку дитину', async (role) => {
      const res = await request(app)
        .get(`${BASE}/children/5`)
        .set('Authorization', tokenFor(role, 1));
      expect(res.status).toBe(StatusCodes.OK);
    });

    test('оплачено наперед -> isPaid: true', async () => {
      billingRepository.findChildWithParents.mockResolvedValueOnce({
        ...CHILD,
        paidUntil: new Date('2999-01-01T00:00:00Z'),
      });
      const res = await request(app)
        .get(`${BASE}/children/5`)
        .set('Authorization', tokenFor('PARENT'));
      expect(res.body).toMatchObject({ paidUntil: '2999-01-01', isPaid: true });
    });

    test('чужа дитина -> 404', async () => {
      const res = await request(app)
        .get(`${BASE}/children/5`)
        .set('Authorization', tokenFor('PARENT', 77));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('дитини немає -> 404', async () => {
      billingRepository.findChildWithParents.mockResolvedValueOnce(null);
      const res = await request(app)
        .get(`${BASE}/children/99`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('дитина без групи -> 400', async () => {
      billingRepository.findChildWithParents.mockResolvedValueOnce({ ...CHILD, group: null });
      const res = await request(app)
        .get(`${BASE}/children/5`)
        .set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('некоректний childId -> 400', async () => {
      const res = await request(app)
        .get(`${BASE}/children/abc`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('POST /billing/children/:childId/payments', () => {
    const url = `${BASE}/children/5/payments`;

    test('без тіла: 201, береться план дитини', async () => {
      const res = await request(app).post(url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        childId: 5,
        plan: 'MONTHLY',
        amount: 350000,
        currency: 'UAH',
      });
      expect(billingRepository.updatePaidUntil).toHaveBeenCalledWith(5, null, expect.any(Date));
    });

    test('plan YEARLY: річна сума', async () => {
      const res = await request(app)
        .post(url)
        .set('Authorization', tokenFor('MANAGER', 2))
        .send({ plan: 'YEARLY' });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({ plan: 'YEARLY', amount: 3780000 });
    });

    test.each([
      ['невідомий plan', { plan: 'WEEKLY' }],
      ['зайве поле', { plan: 'MONTHLY', amount: 1 }],
    ])('%s -> 400', async (_name, body) => {
      const res = await request(app).post(url).set('Authorization', tokenFor('PARENT')).send(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(billingRepository.updatePaidUntil).not.toHaveBeenCalled();
    });

    test('некоректний childId -> 400', async () => {
      const res = await request(app)
        .post(`${BASE}/children/0/payments`)
        .set('Authorization', tokenFor('ADMIN'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('чужа дитина -> 404', async () => {
      const res = await request(app).post(url).set('Authorization', tokenFor('PARENT', 77));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(billingRepository.updatePaidUntil).not.toHaveBeenCalled();
    });

    test('неактивна дитина -> 400', async () => {
      billingRepository.findChildWithParents.mockResolvedValueOnce({ ...CHILD, isActive: false });
      const res = await request(app).post(url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
    });

    test('паралельний платіж -> 409', async () => {
      billingRepository.updatePaidUntil.mockResolvedValueOnce(0);
      const res = await request(app).post(url).set('Authorization', tokenFor('PARENT'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe(ErrorCodes.CONFLICT);
    });
  });
});
