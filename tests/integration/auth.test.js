const request = require('supertest');
const bcrypt = require('bcryptjs');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { authRepository } = require('../../src/modules/auth/auth.repository');
const { ErrorCodes } = require('../../src/errors/errorCodes');

describe('Auth Integration Tests (Supertest)', () => {
  const app = createApp();

  describe('POST /api/v1/auth/login', () => {
    test('повертає 400 при невалідній схемі вхідних даних (короткий пароль / некоректний email)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bad-email', password: '123' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('повертає 401 якщо користувача не знайдено за email', async () => {
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'notfound@kg.ua', password: 'password123' });

      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
    });

    test('повертає 401 якщо пароль не співпадає', async () => {
      const passwordHash = await bcrypt.hash('correctPassword123', 10);
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValueOnce({
        id: 1,
        email: 'user@kg.ua',
        role: 'TEACHER',
        passwordHash,
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user@kg.ua', password: 'wrongPassword123' });

      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
    });

    test("успішний логін (200): повертає JWT токен та об'єкт user без passwordHash", async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValueOnce({
        id: 5,
        email: 'admin@kg.ua',
        role: 'ADMIN',
        passwordHash,
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@kg.ua', password: 'secret123' });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toEqual({
        id: 5,
        email: 'admin@kg.ua',
        role: 'ADMIN',
      });
      expect(res.body.user.passwordHash).toBeUndefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    test('повертає 401 якщо токен відсутній у заголовку Authorization', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ErrorCodes.UNAUTHORIZED);
    });

    test('повертає 200 та профіль користувача з валідним токеном', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      jest.spyOn(authRepository, 'findByEmail').mockResolvedValueOnce({
        id: 10,
        email: 'manager@kg.ua',
        role: 'MANAGER',
        passwordHash,
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'manager@kg.ua', password: 'secret123' });

      const token = loginRes.body.token;

      jest.spyOn(authRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        email: 'manager@kg.ua',
        role: 'MANAGER',
      });

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(StatusCodes.OK);
      expect(meRes.body.user).toEqual({
        id: 10,
        email: 'manager@kg.ua',
        role: 'MANAGER',
      });
    });
  });
});
