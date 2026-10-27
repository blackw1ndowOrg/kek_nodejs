const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const { loginSchema } = require('../../src/modules/auth/auth.schema');
const { AuthRepository, authRepository } = require('../../src/modules/auth/auth.repository');
const { AuthService, authService } = require('../../src/modules/auth/auth.service');
const { AuthController, authController } = require('../../src/modules/auth/auth.controller');
const { UnauthorizedError } = require('../../src/errors/AppError');
const { config } = require('../../src/config');

function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('Auth Module Unit Tests', () => {
  describe('auth.schema (loginSchema)', () => {
    test('валідує коректний email та пароль, нормалізує email', () => {
      const input = {
        email: '  Admin@Kindergarten.UA  ',
        password: 'password123',
      };
      const result = loginSchema.parse(input);
      expect(result).toEqual({
        email: 'admin@kindergarten.ua',
        password: 'password123',
      });
    });

    test('кидає помилку на невалідний email', () => {
      expect(() => loginSchema.parse({ email: 'not-an-email', password: 'password123' })).toThrow();
    });

    test('кидає помилку на короткий пароль (< 6 символів)', () => {
      expect(() => loginSchema.parse({ email: 'admin@kg.ua', password: '123' })).toThrow();
    });
  });

  describe('auth.repository', () => {
    test('створюється з дефолтним клієнтом prisma', () => {
      expect(authRepository).toBeInstanceOf(AuthRepository);
      expect(authRepository.db).toBeDefined();
    });

    test('findByEmail звертається до db.user.findUnique', async () => {
      const mockDb = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 1, email: 'test@kg.ua' }),
        },
      };
      const repo = new AuthRepository(mockDb);
      const res = await repo.findByEmail('test@kg.ua');

      expect(mockDb.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@kg.ua' },
      });
      expect(res).toEqual({ id: 1, email: 'test@kg.ua' });
    });

    test('findById звертається до db.user.findUnique з select', async () => {
      const mockDb = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 1, email: 'test@kg.ua', role: 'ADMIN' }),
        },
      };
      const repo = new AuthRepository(mockDb);
      const res = await repo.findById(1);

      expect(mockDb.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(res).toEqual({ id: 1, email: 'test@kg.ua', role: 'ADMIN' });
    });
  });

  describe('auth.service', () => {
    const rawPassword = 'secretPassword123';
    let hashedPassword;

    beforeAll(async () => {
      hashedPassword = await bcrypt.hash(rawPassword, 10);
    });

    test('створюється з дефолтним authRepository', () => {
      expect(authService).toBeInstanceOf(AuthService);
      expect(authService.repository).toBe(authRepository);
    });

    test('login: успішний логін повертає токен та user без passwordHash', async () => {
      const mockUser = {
        id: 10,
        email: 'user@kg.ua',
        role: 'MANAGER',
        passwordHash: hashedPassword,
      };
      const mockRepo = {
        findByEmail: jest.fn().mockResolvedValue(mockUser),
      };
      const service = new AuthService(mockRepo);

      const result = await service.login({ email: 'user@kg.ua', password: rawPassword });

      expect(mockRepo.findByEmail).toHaveBeenCalledWith('user@kg.ua');
      expect(result.token).toBeDefined();
      expect(result.user).toEqual({
        id: 10,
        email: 'user@kg.ua',
        role: 'MANAGER',
      });

      const decoded = jwt.verify(result.token, config.jwtSecret);
      expect(decoded.id).toBe(10);
      expect(decoded.role).toBe('MANAGER');
    });

    test('login: користувача не знайдено -> UnauthorizedError', async () => {
      const mockRepo = {
        findByEmail: jest.fn().mockResolvedValue(null),
      };
      const service = new AuthService(mockRepo);

      await expect(service.login({ email: 'missing@kg.ua', password: 'any' })).rejects.toThrow(
        UnauthorizedError
      );
    });

    test('login: невірний пароль -> UnauthorizedError', async () => {
      const mockUser = {
        id: 10,
        email: 'user@kg.ua',
        role: 'MANAGER',
        passwordHash: hashedPassword,
      };
      const mockRepo = {
        findByEmail: jest.fn().mockResolvedValue(mockUser),
      };
      const service = new AuthService(mockRepo);

      await expect(
        service.login({ email: 'user@kg.ua', password: 'wrongPassword' })
      ).rejects.toThrow(UnauthorizedError);
    });

    test('me: успішно повертає профіль користувача', async () => {
      const mockUser = {
        id: 5,
        email: 'admin@kg.ua',
        role: 'ADMIN',
      };
      const mockRepo = {
        findById: jest.fn().mockResolvedValue(mockUser),
      };
      const service = new AuthService(mockRepo);

      const user = await service.me(5);
      expect(mockRepo.findById).toHaveBeenCalledWith(5);
      expect(user).toEqual(mockUser);
    });

    test('me: користувача не знайдено -> UnauthorizedError', async () => {
      const mockRepo = {
        findById: jest.fn().mockResolvedValue(null),
      };
      const service = new AuthService(mockRepo);

      await expect(service.me(999)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('auth.controller', () => {
    test('створюється з дефолтним authService', () => {
      expect(authController).toBeInstanceOf(AuthController);
      expect(authController.service).toBe(authService);
    });

    test('login: повертає результат сервісу зі статусом 200', async () => {
      const mockService = {
        login: jest.fn().mockResolvedValue({ token: 'jwt-token', user: { id: 1 } }),
      };
      const controller = new AuthController(mockService);
      const req = { body: { email: 'a@b.com', password: 'pass' } };
      const res = fakeRes();

      await controller.login(req, res);

      expect(mockService.login).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ token: 'jwt-token', user: { id: 1 } });
    });

    test('me: повертає користувача зі статусом 200', async () => {
      const mockService = {
        me: jest.fn().mockResolvedValue({ id: 1, role: 'ADMIN' }),
      };
      const controller = new AuthController(mockService);
      const req = { user: { id: 1 } };
      const res = fakeRes();

      await controller.me(req, res);

      expect(mockService.me).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ user: { id: 1, role: 'ADMIN' } });
    });
  });
});
