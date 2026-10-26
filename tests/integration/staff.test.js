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
  });

  describe('POST /api/v1/staff', () => {
    test('повертає 400 якщо не передано type', async () => {
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Іван Петров' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 400 якщо type невалідний', async () => {
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Іван Петров', type: 'INVALID_TYPE' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 201 при успішному створенні працівника', async () => {
      jest.spyOn(staffRepository, 'create').mockResolvedValueOnce({
        id: 101,
        fullName: 'Олена Ковальчук',
        type: 'EDUCATOR',
        isActive: true,
        userId: null,
      });

      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Олена Ковальчук', type: 'EDUCATOR' });

      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.id).toBe(101);
      expect(res.body.fullName).toBe('Олена Ковальчук');
      expect(res.body.type).toBe('EDUCATOR');
    });
  });

  describe('GET /api/v1/staff', () => {
    test('повертає 200 та список працівників', async () => {
      jest.spyOn(staffRepository, 'findAll').mockResolvedValueOnce([
        { id: 1, fullName: 'Оксана', type: 'EDUCATOR', isActive: true },
      ]);

      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.staff).toHaveLength(1);
      expect(res.body.staff[0].fullName).toBe('Оксана');
    });

    test('GET з query isActive=true валідується та повертає 200', async () => {
      jest.spyOn(staffRepository, 'findAll').mockResolvedValueOnce([
        { id: 1, fullName: 'Оксана', type: 'EDUCATOR', isActive: true },
      ]);

      const res = await request(app)
        .get('/api/v1/staff?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(staffRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true })
      );
    });

    test('GET з невалідним query type=INVALID повертає 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/staff?type=INVALID')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/staff/:id', () => {
    test('повертає 400 якщо id не числовий', async () => {
      const res = await request(app)
        .get('/api/v1/staff/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    test('повертає 404 якщо співробітника не знайдено', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/staff/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    test('повертає 200 та знайденого співробітника', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 5,
        fullName: 'Дмитро',
        type: 'MANAGER',
      });

      const res = await request(app)
        .get('/api/v1/staff/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.id).toBe(5);
      expect(res.body.fullName).toBe('Дмитро');
    });
  });

  describe('PATCH /api/v1/staff/:id', () => {
    test('повертає 200 та оновленого співробітника', async () => {
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

  describe('GET /api/v1/staff/:id/salary', () => {
    test('повертає 200 та розрахунок зарплати вихователя', async () => {
      jest.spyOn(staffRepository, 'findById').mockResolvedValueOnce({
        id: 10,
        fullName: 'Марія Вихователь',
        type: 'EDUCATOR',
        isActive: true,
        educatorOf: {
          name: 'Сонечко',
          children: new Array(15).fill({ id: 1 }),
        },
      });

      const res = await request(app)
        .get('/api/v1/staff/10/salary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.salary).toBe(3900000);
      expect(res.body.details.childrenCount).toBe(15);
    });

    test('повертає 403 для ролі TEACHER', async () => {
      const res = await request(app)
        .get('/api/v1/staff/10/salary')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
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
