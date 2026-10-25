const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { parentsRepository } = require('../../src/modules/parents/parents.repository');
const { prisma } = require('../../src/config/prisma');

describe('Parents Integration Tests (Supertest)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(prisma);
    });
  });

  const adminToken = jwt.sign(
    { id: 1, email: 'admin@kg.local', role: 'ADMIN' },
    config.jwtSecret,
    { expiresIn: '30m' }
  );

  const teacherToken = jwt.sign(
    { id: 2, email: 'teacher@kg.local', role: 'TEACHER' },
    config.jwtSecret,
    { expiresIn: '30m' }
  );

  describe('Authorization check', () => {
    test('повертає 401 якщо токен відсутній', async () => {
      const res = await request(app).get('/api/v1/parents');
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test('повертає 403 якщо роль не має доступу (наприклад, TEACHER)', async () => {
      const res = await request(app)
        .get('/api/v1/parents')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /api/v1/parents', () => {
    test('повертає 400 якщо не передано обов\'язкове поле fullName', async () => {
      const res = await request(app)
        .post('/api/v1/parents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '+380501234567' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 400 якщо номер телефону некоректний', async () => {
      const res = await request(app)
        .post('/api/v1/parents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Тестовий Батько', phone: '123' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 201 при успішному створенні батьків', async () => {
      jest.spyOn(parentsRepository, 'create').mockResolvedValueOnce({
        id: 101,
        fullName: 'Олександр Петренко',
        phone: '+380501112233',
        debt: 0,
        userId: null,
      });

      const res = await request(app)
        .post('/api/v1/parents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Олександр Петренко', phone: '+380501112233' });

      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.id).toBe(101);
      expect(res.body.fullName).toBe('Олександр Петренко');
    });
  });

  describe('GET /api/v1/parents', () => {
    test('повертає 200 та список батьків', async () => {
      jest.spyOn(parentsRepository, 'findAll').mockResolvedValueOnce([
        { id: 1, fullName: 'Марія Коваль', phone: '+380509998877', debt: 0 },
      ]);

      const res = await request(app)
        .get('/api/v1/parents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.parents).toHaveLength(1);
      expect(res.body.parents[0].fullName).toBe('Марія Коваль');
    });
  });

  describe('GET /api/v1/parents/:id', () => {
    test('повертає 404 якщо батьків за ID не знайдено', async () => {
      jest.spyOn(parentsRepository, 'findById').mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/parents/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('повертає 200 та знайдений об\'єкт батьків', async () => {
      jest.spyOn(parentsRepository, 'findById').mockResolvedValueOnce({
        id: 42,
        fullName: 'Тарас Шевченко',
        phone: '+380501112233',
        debt: 0,
      });

      const res = await request(app)
        .get('/api/v1/parents/42')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.id).toBe(42);
      expect(res.body.fullName).toBe('Тарас Шевченко');
    });
  });

  describe('PATCH /api/v1/parents/:id', () => {
    test('повертає 200 та оновлює дані батьків', async () => {
      jest.spyOn(parentsRepository, 'findById').mockResolvedValueOnce({
        id: 42,
        fullName: 'Старе Ім\'я',
        debt: 0,
      });
      jest.spyOn(parentsRepository, 'update').mockResolvedValueOnce({
        id: 42,
        fullName: 'Оновлене Ім\'я',
        debt: 10000,
      });

      const res = await request(app)
        .patch('/api/v1/parents/42')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Оновлене Ім\'я', debt: 10000 });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.fullName).toBe('Оновлене Ім\'я');
      expect(res.body.debt).toBe(10000);
    });
  });

  describe('DELETE /api/v1/parents/:id', () => {
    test('повертає 409 Conflict при спробі видалити батьків з непогашеним боргом', async () => {
      jest.spyOn(parentsRepository, 'findById').mockResolvedValueOnce({
        id: 5,
        debt: 50000, // є борг
      });

      const res = await request(app)
        .delete('/api/v1/parents/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.CONFLICT);
    });

    test('повертає 204 No Content при успішному видаленні', async () => {
      jest.spyOn(parentsRepository, 'findById').mockResolvedValueOnce({
        id: 5,
        debt: 0,
        userId: null,
      });
      jest.spyOn(parentsRepository, 'delete').mockResolvedValueOnce({ id: 5 });

      const res = await request(app)
        .delete('/api/v1/parents/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.NO_CONTENT);
    });
  });
});
