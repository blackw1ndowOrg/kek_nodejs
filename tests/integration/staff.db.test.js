const { prisma } = require('../../src/config/prisma');
const { staffRepository } = require('../../src/modules/staff/staff.repository');
const { staffService } = require('../../src/modules/staff/staff.service');
const { ConflictError } = require('../../src/errors/AppError');

describe('Staff Database Integration Tests (Real PostgreSQL)', () => {
  let isDbConnected = false;
  const createdStaffIds = [];
  const createdUserIds = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch {
      isDbConnected = false;
      console.warn('[Real DB Tests] PostgreSQL is not reachable, skipping live DB tests.');
    }
  });

  afterEach(async () => {
    if (!isDbConnected) return;

    if (createdStaffIds.length > 0) {
      await prisma.staff.deleteMany({
        where: { id: { in: createdStaffIds } },
      });
      createdStaffIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    if (isDbConnected) {
      await prisma.$disconnect();
    }
  });

  const runIfDb = (name, fn) => {
    test(name, async () => {
      if (!isDbConnected) {
        return;
      }
      await fn();
    });
  };

  describe('StaffRepository - реальні SQL-запити до PostgreSQL', () => {
    runIfDb('create: створює запис у реальній таблиці Staff', async () => {
      const staff = await staffRepository.create({
        fullName: 'Реальний Працівник Тест',
        type: 'EDUCATOR',
        isActive: true,
      });

      createdStaffIds.push(staff.id);

      expect(staff).toBeDefined();
      expect(staff.id).toBeGreaterThan(0);
      expect(staff.fullName).toBe('Реальний Працівник Тест');
      expect(staff.type).toBe('EDUCATOR');
      expect(staff.isActive).toBe(true);
      expect(staff.userId).toBeNull();
    });

    runIfDb(
      'findAll: нечутливий до регістру пошук (mode: insensitive -> ILIKE у PostgreSQL)',
      async () => {
        const staff = await staffRepository.create({
          fullName: 'УнікальнийПедагогДляПошуку',
          type: 'EDUCATOR',
          isActive: true,
        });
        createdStaffIds.push(staff.id);

        // 1. Пошук у нижньому регістрі
        const lowerSearch = await staffRepository.findAll({ search: 'педагогдляпошуку' });
        expect(lowerSearch.some((s) => s.id === staff.id)).toBe(true);

        // 2. Пошук у верхньому регістрі
        const upperSearch = await staffRepository.findAll({ search: 'ПЕДАГОГДЛЯПОШУКУ' });
        expect(upperSearch.some((s) => s.id === staff.id)).toBe(true);

        // 3. Пошук змішаним регістром
        const mixedSearch = await staffRepository.findAll({ search: 'ПеДаГоГ' });
        expect(mixedSearch.some((s) => s.id === staff.id)).toBe(true);
      }
    );

    runIfDb('findAll: фільтрація за type та isActive у реальній базі', async () => {
      const activeEducator = await staffRepository.create({
        fullName: 'Активний Вихователь SQL',
        type: 'EDUCATOR',
        isActive: true,
      });
      const inactiveManager = await staffRepository.create({
        fullName: 'Неактивний Менеджер SQL',
        type: 'MANAGER',
        isActive: false,
      });

      createdStaffIds.push(activeEducator.id, inactiveManager.id);

      const educators = await staffRepository.findAll({ type: 'EDUCATOR' });
      expect(educators.some((s) => s.id === activeEducator.id)).toBe(true);
      expect(educators.some((s) => s.id === inactiveManager.id)).toBe(false);

      const inactive = await staffRepository.findAll({ isActive: false });
      expect(inactive.some((s) => s.id === inactiveManager.id)).toBe(true);
      expect(inactive.some((s) => s.id === activeEducator.id)).toBe(false);
    });

    runIfDb('findById: завантажує запис разом із зв\'язками Prisma', async () => {
      const staff = await staffRepository.create({
        fullName: 'Співробітник Зв\'язків',
        type: 'CLUB_TEACHER',
        isActive: true,
      });
      createdStaffIds.push(staff.id);

      const found = await staffRepository.findById(staff.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(staff.id);
      expect(found).toHaveProperty('user');
      expect(found).toHaveProperty('educatorOf');
      expect(found).toHaveProperty('assistantOf');
      expect(found).toHaveProperty('clubTaught');
    });

    runIfDb('update: оновлює дані співробітника у PostgreSQL', async () => {
      const staff = await staffRepository.create({
        fullName: 'Старе Ім\'я',
        type: 'ASSISTANT',
        isActive: true,
      });
      createdStaffIds.push(staff.id);

      const updated = await staffRepository.update(staff.id, {
        fullName: 'Нове Оновлене Ім\'я',
        isActive: false,
      });

      expect(updated.id).toBe(staff.id);
      expect(updated.fullName).toBe('Нове Оновлене Ім\'я');
      expect(updated.isActive).toBe(false);

      const verified = await staffRepository.findById(staff.id);
      expect(verified.fullName).toBe('Нове Оновлене Ім\'я');
      expect(verified.isActive).toBe(false);
    });

    runIfDb('delete: видаляє запис з реальної бази даних', async () => {
      const staff = await staffRepository.create({
        fullName: 'Працівник На Видалення',
        type: 'EDUCATOR',
        isActive: true,
      });

      await staffRepository.delete(staff.id);

      const found = await staffRepository.findById(staff.id);
      expect(found).toBeNull();
    });
  });

  describe('StaffService - реальні транзакції та зв\'язані сутності', () => {
    runIfDb(
      'createStaff: створює Staff та User в одній транзакції PostgreSQL',
      async () => {
        const uniqueEmail = `real.db.teacher.${Date.now()}@kg.local`;

        const result = await staffService.createStaff({
          fullName: 'Транзакційний Вчитель',
          type: 'EDUCATOR',
          isActive: true,
          user: {
            email: uniqueEmail,
            password: 'StrongPassword123!',
          },
        });

        createdStaffIds.push(result.id);
        if (result.userId) {
          createdUserIds.push(result.userId);
        }

        expect(result.id).toBeDefined();
        expect(result.userId).toBeDefined();

        // Перевіряємо створеного користувача напряму в базі
        const userInDb = await prisma.user.findUnique({
          where: { id: result.userId },
        });
        expect(userInDb).toBeDefined();
        expect(userInDb.email).toBe(uniqueEmail);
        expect(userInDb.role).toBe('TEACHER');
      }
    );

    runIfDb(
      'deleteStaff: видаляє Staff та зв\'язаного User у реальній транзакції',
      async () => {
        const uniqueEmail = `delete.user.${Date.now()}@kg.local`;

        const created = await staffService.createStaff({
          fullName: 'Співробітник з Акаунтом',
          type: 'MANAGER',
          isActive: true,
          user: {
            email: uniqueEmail,
            password: 'Password123!',
          },
        });

        const staffId = created.id;
        const userId = created.userId;

        await staffService.deleteStaff(staffId);

        const staffCheck = await prisma.staff.findUnique({ where: { id: staffId } });
        const userCheck = await prisma.user.findUnique({ where: { id: userId } });

        expect(staffCheck).toBeNull();
        expect(userCheck).toBeNull();
      }
    );

    runIfDb(
      'createStaff: перехоплює реальний P2002 від PostgreSQL та кидає ConflictError при дублікаті email',
      async () => {
        const duplicateEmail = `dup.${Date.now()}@kg.local`;

        const first = await staffService.createStaff({
          fullName: 'Перший Користувач',
          type: 'EDUCATOR',
          user: { email: duplicateEmail, password: 'Password123!' },
        });
        createdStaffIds.push(first.id);
        if (first.userId) createdUserIds.push(first.userId);

        // Друга спроба з тим самим email має викликати P2002 в PostgreSQL
        await expect(
          staffService.createStaff({
            fullName: 'Другий Користувач',
            type: 'EDUCATOR',
            user: { email: duplicateEmail, password: 'Password123!' },
          })
        ).rejects.toThrow(ConflictError);
      }
    );

    runIfDb(
      'deleteStaff: забороняє видалення співробітника, закріпленого за діючою групою в БД (409 Conflict)',
      async () => {
        // Вихователь ID 7 закріплений за групою "Сонечко"
        await expect(staffService.deleteStaff(7)).rejects.toThrow(ConflictError);
      }
    );

    runIfDb(
      'getStaffSalary: розраховує зарплату на основі реальних зв\'язків з дітьми у БД',
      async () => {
        // Вихователь ID 8 закріплений за групою "Дзвіночок" з 14 реальними дітьми (> 12)
        // Розрахунок: 14 * 200_000 + (14 - 12) * 300_000 = 2_800_000 + 600_000 = 3_400_000 копійок (34 000 грн)
        const salaryInfo = await staffService.getStaffSalary(8);

        expect(salaryInfo.staffId).toBe(8);
        expect(salaryInfo.type).toBe('EDUCATOR');
        expect(salaryInfo.details.childrenCount).toBe(14);
        expect(salaryInfo.details.groupName).toBe('Дзвіночок');
        expect(salaryInfo.salary).toBe(3400000);
      }
    );
  });
});
