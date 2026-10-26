const request = require('supertest');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { config } = require('../../src/config');
const { staffRepository } = require('../../src/modules/staff/staff.repository');
const { prisma } = require('../../src/config/prisma');

describe('Staff Integration Tests (Supertest)', () => {
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

  const parentToken = jwt.sign(
    { id: 3, email: 'parent@kg.local', role: 'PARENT' },
    config.jwtSecret,
    { expiresIn: '30m' }
  );

  describe('RBAC & Auth checks', () => {
    test('повертає 401 якщо токен відсутній', async () => {
      const res = await request(app).get('/api/v1/staff');
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    });

    test('повертає 403 для ролі PARENT при спробі читання staff', async () => {
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    test('дозволяє TEACHER читати список staff (200 OK)', async () => {
      jest.spyOn(staffRepository, 'findAll').mockResolvedValueOnce([
        { id: 1, fullName: 'Марія' },
      ]);

      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(StatusCodes.OK);
    });

    test('повертає 403 для TEACHER при спробі створити співробітника', async () => {
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ fullName: 'Новий', type: 'ASSISTANT' });

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /api/v1/staff', () => {
    test('повертає 400 якщо передано неіснуючий тип посади', async () => {
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Іван Кухар', type: 'CHEF' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 201 при успішному створенні співробітника', async () => {
      jest.spyOn(staffRepository, 'create').mockResolvedValueOnce({
        id: 77,
        fullName: 'Оксана Сергіївна',
        type: 'EDUCATOR',
        isActive: true,
        userId: null,
      });

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Оксана Сергіївна', type: 'EDUCATOR' });

      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.id).toBe(77);
      expect(res.body.fullName).toBe('Оксана Сергіївна');
    });
  });

  describe('GET /api/v1/staff', () => {
    test('повертає 200 та список співробітників', async () => {
      jest.spyOn(staffRepository, 'findAll').mockResolvedValueOnce([
        { id: 1, fullName: 'Анна', type: 'MANAGER', isActive: true },
      ]);

      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.staff).toHaveLength(1);
      expect(res.body.staff[0].fullName).toBe('Анна');
    });
  });

  describe('GET /api/v1/staff/:id', () => {
    test('повертає 404 якщо співробітника не знайдено', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/staff/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('повертає 200 та знайденого співробітника', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        fullName: 'Богдан Викладач',
        type: 'CLUB_TEACHER',
      });

      const res = await request(app)
        .get('/api/v1/staff/10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.id).toBe(10);
      expect(res.body.fullName).toBe('Богдан Викладач');
    });
  });

  describe('PATCH /api/v1/staff/:id', () => {
    test('повертає 200 та оновлює дані співробітника', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        fullName: 'Богдан',
      });
      jest.spyOn(staffRepository, 'update').mockResolvedValueOnce({
        id: 10,
        fullName: 'Богдан Оновлений',
      });

      const res = await request(app)
        .patch('/api/v1/staff/10')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Богдан Оновлений' });

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.fullName).toBe('Богдан Оновлений');
    });
  });

  describe('DELETE /api/v1/staff/:id', () => {
    test('повертає 409 якщо працівник закріплений за діючою групою', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        educatorOf: { id: 1, name: 'Калинка' },
      });

      const res = await request(app)
        .delete('/api/v1/staff/10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.CONFLICT);
    });

    test('повертає 204 при успішному видаленні вільного співробітника', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        educatorOf: null,
        assistantOf: null,
        clubTaught: null,
        userId: null,
      });
      jest.spyOn(staffRepository, 'delete').mockResolvedValueOnce({ id: 10 });

      const res = await request(app)
        .delete('/api/v1/staff/10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.NO_CONTENT);
    });
  });
});
