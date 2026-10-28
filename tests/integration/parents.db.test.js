const { prisma } = require('../../src/config/prisma');
const { parentsRepository } = require('../../src/modules/parents/parents.repository');
const { parentsService } = require('../../src/modules/parents/parents.service');
const { ConflictError } = require('../../src/errors/AppError');

describe('Parents Database Integration Tests (Real PostgreSQL)', () => {
  let isDbConnected = false;
  const createdParentIds = [];
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

    if (createdParentIds.length > 0) {
      await prisma.parent.deleteMany({
        where: { id: { in: createdParentIds } },
      });
      createdParentIds.length = 0;
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

  describe('ParentsRepository - реальні SQL-запити до PostgreSQL', () => {
    runIfDb('create: створює запис у реальній таблиці Parent', async () => {
      const parent = await parentsRepository.create({
        fullName: 'Реальний Батько Тест',
        phone: '+380501112233',
        debt: 0,
      });

      createdParentIds.push(parent.id);

      expect(parent).toBeDefined();
      expect(parent.id).toBeGreaterThan(0);
      expect(parent.fullName).toBe('Реальний Батько Тест');
      expect(parent.phone).toBe('+380501112233');
      expect(parent.debt).toBe(0);
      expect(parent.userId).toBeNull();
    });

    runIfDb(
      'findAll: нечутливий до регістру пошук за fullName (mode: insensitive -> ILIKE у PostgreSQL)',
      async () => {
        const parent = await parentsRepository.create({
          fullName: 'УнікальнийБатькоДляПошуку',
          phone: '+380509998877',
          debt: 0,
        });
        createdParentIds.push(parent.id);

        // 1. Пошук у нижньому регістрі
        const lowerSearch = await parentsRepository.findAll({ search: 'батькодляпошуку' });
        expect(lowerSearch.some((p) => p.id === parent.id)).toBe(true);

        // 2. Пошук у верхньому регістрі
        const upperSearch = await parentsRepository.findAll({ search: 'БАТЬКОДЛЯПОШУКУ' });
        expect(upperSearch.some((p) => p.id === parent.id)).toBe(true);

        // 3. Пошук змішаним регістром
        const mixedSearch = await parentsRepository.findAll({ search: 'БаТьКо' });
        expect(mixedSearch.some((p) => p.id === parent.id)).toBe(true);
      }
    );

    runIfDb('findAll: пошук за частиною номера телефону', async () => {
      const parent = await parentsRepository.create({
        fullName: 'Батько З Тел',
        phone: '+380997775533',
        debt: 0,
      });
      createdParentIds.push(parent.id);

      const found = await parentsRepository.findAll({ search: '7775533' });
      expect(found.some((p) => p.id === parent.id)).toBe(true);
    });

    runIfDb("findById: завантажує запис разом із зв'язками дітей та користувача", async () => {
      // Використовуємо батька ID 1 з seed-даних, у якого є зв'язок з дитиною
      const found = await parentsRepository.findById(1);

      expect(found).toBeDefined();
      expect(found.id).toBe(1);
      expect(found).toHaveProperty('user');
      expect(found).toHaveProperty('children');
      expect(Array.isArray(found.children)).toBe(true);
      expect(found.children.length).toBeGreaterThan(0);
      expect(found.children[0]).toHaveProperty('child');
    });

    runIfDb('update: оновлює дані батьків у PostgreSQL', async () => {
      const parent = await parentsRepository.create({
        fullName: "Старе Ім'я Батька",
        phone: '+380500000000',
        debt: 0,
      });
      createdParentIds.push(parent.id);

      const updated = await parentsRepository.update(parent.id, {
        fullName: "Оновлене Ім'я Батька",
        phone: '+380509999999',
        debt: 50000,
      });

      expect(updated.id).toBe(parent.id);
      expect(updated.fullName).toBe("Оновлене Ім'я Батька");
      expect(updated.phone).toBe('+380509999999');
      expect(updated.debt).toBe(50000);

      const verified = await parentsRepository.findById(parent.id);
      expect(verified.fullName).toBe("Оновлене Ім'я Батька");
      expect(verified.debt).toBe(50000);
    });

    runIfDb('delete: видаляє запис з реальної бази даних', async () => {
      const parent = await parentsRepository.create({
        fullName: 'Батько На Видалення',
        phone: '+380503332211',
        debt: 0,
      });

      await parentsRepository.delete(parent.id);

      const found = await parentsRepository.findById(parent.id);
      expect(found).toBeNull();
    });
  });

  describe('ParentsService - бізнес-правила та транзакції PostgreSQL', () => {
    runIfDb(
      'createParent: створює Parent та User (role: PARENT) в одній транзакції PostgreSQL',
      async () => {
        const uniqueEmail = `real.db.parent.${Date.now()}@kg.local`;

        const result = await parentsService.createParent({
          fullName: 'Транзакційний Батько',
          phone: '+380671234567',
          debt: 0,
          user: {
            email: uniqueEmail,
            password: 'StrongPassword123!',
          },
        });

        createdParentIds.push(result.id);
        if (result.userId) {
          createdUserIds.push(result.userId);
        }

        expect(result.id).toBeDefined();
        expect(result.userId).toBeDefined();

        // Перевіряємо створеного юзера напряму в базі
        const userInDb = await prisma.user.findUnique({
          where: { id: result.userId },
        });
        expect(userInDb).toBeDefined();
        expect(userInDb.email).toBe(uniqueEmail);
        expect(userInDb.role).toBe('PARENT');
      }
    );

    runIfDb(
      'createParent: перехоплює реальний P2002 від PostgreSQL та кидає ConflictError при дублікаті email',
      async () => {
        const duplicateEmail = `parent.dup.${Date.now()}@kg.local`;

        const first = await parentsService.createParent({
          fullName: 'Перший Батько',
          phone: '+380501111111',
          user: { email: duplicateEmail, password: 'Password123!' },
        });
        createdParentIds.push(first.id);
        if (first.userId) createdUserIds.push(first.userId);

        // Друга спроба з тим самим email у PostgreSQL має викликати P2002
        await expect(
          parentsService.createParent({
            fullName: 'Другий Батько',
            phone: '+380502222222',
            user: { email: duplicateEmail, password: 'Password123!' },
          })
        ).rejects.toThrow(ConflictError);
      }
    );

    runIfDb(
      'deleteParent: блокує видалення батьків з непогашеним боргом (debt > 0, 409 Conflict)',
      async () => {
        // Батько ID 3 з seed-даних має debt = 1500000 (15 000 грн)
        await expect(parentsService.deleteParent(3)).rejects.toThrow(ConflictError);
      }
    );

    runIfDb(
      'deleteParent: блокує видалення батьків, якщо активна дитина залишиться сиротою (409 Conflict)',
      async () => {
        // Батько ID 1 закріплений за активною дитиною, яка не має інших зареєстрованих батьків
        await expect(parentsService.deleteParent(1)).rejects.toThrow(ConflictError);
      }
    );

    runIfDb(
      "deleteParent: успішно видаляє вільного батька та зв'язаного User у реальній транзакції",
      async () => {
        const uniqueEmail = `delete.parent.${Date.now()}@kg.local`;

        const created = await parentsService.createParent({
          fullName: 'Вільний Батько Без Дітей',
          phone: '+380509990000',
          debt: 0,
          user: {
            email: uniqueEmail,
            password: 'Password123!',
          },
        });

        const parentId = created.id;
        const userId = created.userId;

        await parentsService.deleteParent(parentId);

        const parentCheck = await prisma.parent.findUnique({ where: { id: parentId } });
        const userCheck = await prisma.user.findUnique({ where: { id: userId } });

        expect(parentCheck).toBeNull();
        expect(userCheck).toBeNull();
      }
    );
  });
});
