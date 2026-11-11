const {
  ChildrenService,
  childrenService,
} = require('../../../src/modules/children/children.service');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../../src/errors/AppError');

const ADMIN = { id: 1, role: 'ADMIN' };
const MANAGER = { id: 2, role: 'MANAGER' };
const PARENT = { id: 12, role: 'PARENT' };

// 26.10.2026 -> навчальний рік 2026: вік рахується на 01.09.2026
const TODAY = new Date('2026-10-26T10:00:00Z');
const birth = (date) => new Date(date);

const CHILD = Object.freeze({
  id: 5,
  fullName: 'Іван Петренко',
  birthDate: birth('2022-03-15'),
  notes: null,
  discountPercent: 20,
  paymentPlan: 'MONTHLY',
  hasDeputyRelatives: true,
  paidUntil: null,
  isActive: true,
  groupId: 3,
});

function createService() {
  const repository = {
    findMany: jest.fn().mockResolvedValue([CHILD]),
    findById: jest.fn().mockResolvedValue(CHILD),
    countParents: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CHILD),
    update: jest.fn().mockResolvedValue(CHILD),
    // CHILD на 01.09.2026 має 4 роки — і група 3 для 4-річних
    findGroup: jest.fn().mockResolvedValue({ name: 'Сонечко', age: 4 }),
  };
  const settings = { get: jest.fn().mockReturnValue([10, 20, 30]) };
  const service = new ChildrenService(repository, settings, () => TODAY);
  return { repository, settings, service };
}

describe('ChildrenService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(childrenService).toBeInstanceOf(ChildrenService);
    expect(childrenService.now()).toBeInstanceOf(Date);
  });

  describe('list', () => {
    test('адмін бачить усіх і всі поля', async () => {
      const { repository, service } = createService();
      await expect(service.list(ADMIN, { groupId: 3 })).resolves.toEqual([CHILD]);
      expect(repository.findMany).toHaveBeenCalledWith({ groupId: 3, parentUserId: undefined });
    });

    test('без фільтрів', async () => {
      const { repository, service } = createService();
      await service.list(MANAGER);
      expect(repository.findMany).toHaveBeenCalledWith({ parentUserId: undefined });
    });

    test('батько — лише свої діти, без знижки й кумівства', async () => {
      const { repository, service } = createService();
      const [child] = await service.list(PARENT);
      expect(repository.findMany).toHaveBeenCalledWith({ parentUserId: 12 });
      expect(child).not.toHaveProperty('discountPercent');
      expect(child).not.toHaveProperty('hasDeputyRelatives');
      expect(child.fullName).toBe(CHILD.fullName);
    });
  });

  describe('getById', () => {
    test('батько отримує свою дитину без прихованих полів', async () => {
      const { repository, service } = createService();
      const child = await service.getById(PARENT, 5);
      expect(repository.findById).toHaveBeenCalledWith(5, 12);
      expect(child).not.toHaveProperty('discountPercent');
    });

    test('неіснуюча або чужа дитина -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.getById(PARENT, 99)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    const data = { fullName: 'Іван', birthDate: birth('2022-03-15'), parentIds: [7, 7] };

    test('менеджер реєструє дитину; дублікати parentIds прибрано', async () => {
      const { repository, service } = createService();
      await expect(service.create(MANAGER, data)).resolves.toEqual(CHILD);
      expect(repository.countParents).toHaveBeenCalledWith([7]);
      expect(repository.create).toHaveBeenCalledWith(
        { fullName: 'Іван', birthDate: data.birthDate },
        [7]
      );
    });

    test.each([
      ['2 роки рівно на 1 вересня', '2024-09-01'],
      ['5 років', '2021-01-10'],
    ])('вік у межах: %s', async (_name, date) => {
      const { service } = createService();
      await expect(service.create(MANAGER, { ...data, birthDate: birth(date) })).resolves.toBe(
        CHILD
      );
    });

    test.each([
      ['1 рік', '2024-09-02'],
      ['6 років', '2020-08-31'],
      ['народиться після 1 вересня', '2026-10-01'],
    ])('вік поза межами: %s -> 400', async (_name, date) => {
      const { service } = createService();
      await expect(service.create(MANAGER, { ...data, birthDate: birth(date) })).rejects.toThrow(
        BadRequestError
      );
    });

    test('неіснуючий батько -> 404', async () => {
      const { repository, service } = createService();
      repository.countParents.mockResolvedValueOnce(1);
      await expect(service.create(MANAGER, { ...data, parentIds: [7, 8] })).rejects.toThrow(
        NotFoundError
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    test('адмін призначає пільгу з налаштувань', async () => {
      const { repository, settings, service } = createService();
      await service.create(ADMIN, { ...data, discountPercent: 30, hasDeputyRelatives: true });
      expect(settings.get).toHaveBeenCalledWith('DISCOUNT_LEVELS');
      expect(repository.create).toHaveBeenCalled();
    });

    test('знижка 0 дозволена завжди', async () => {
      const { service } = createService();
      await expect(service.create(ADMIN, { ...data, discountPercent: 0 })).resolves.toBe(CHILD);
    });

    test('знижка не з рівнів -> 400', async () => {
      const { service } = createService();
      await expect(service.create(ADMIN, { ...data, discountPercent: 15 })).rejects.toThrow(
        BadRequestError
      );
    });

    test.each([
      ['знижка', { discountPercent: 10 }],
      ['кумівство', { hasDeputyRelatives: true }],
    ])('менеджер не може задати поле адміна: %s -> 403', async (_name, extra) => {
      const { service } = createService();
      await expect(service.create(MANAGER, { ...data, ...extra })).rejects.toThrow(ForbiddenError);
    });
  });

  describe('update', () => {
    test('менеджер змінює дані дитини', async () => {
      const { repository, service } = createService();
      await service.update(MANAGER, 5, { fullName: 'Олена', paymentPlan: 'YEARLY' });
      expect(repository.findById).toHaveBeenCalledWith(5, undefined);
      expect(repository.update).toHaveBeenCalledWith(5, {
        fullName: 'Олена',
        paymentPlan: 'YEARLY',
      });
    });

    test('батько змінює примітку своєї дитини й отримує відповідь без прихованих полів', async () => {
      const { repository, service } = createService();
      const child = await service.update(PARENT, 5, { notes: 'не любить гречку' });
      expect(repository.findById).toHaveBeenCalledWith(5, 12);
      expect(repository.update).toHaveBeenCalledWith(5, { notes: 'не любить гречку' });
      expect(child).not.toHaveProperty('hasDeputyRelatives');
    });

    test('деактивація через update скидає groupId на null', async () => {
      const { repository, service } = createService();
      await service.update(MANAGER, 5, { isActive: false });
      expect(repository.update).toHaveBeenCalledWith(5, { isActive: false, groupId: null });
    });

    test('батько не може змінювати інші поля -> 403', async () => {
      const { repository, service } = createService();
      await expect(service.update(PARENT, 5, { fullName: 'Інше' })).rejects.toThrow(ForbiddenError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    test('чужа або неіснуюча дитина -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.update(PARENT, 99, { notes: 'x' })).rejects.toThrow(NotFoundError);
    });

    test('нова дата народження перевіряється на вік', async () => {
      const { service } = createService();
      await expect(service.update(MANAGER, 5, { birthDate: birth('2019-05-05') })).rejects.toThrow(
        BadRequestError
      );
      await expect(service.update(MANAGER, 5, { birthDate: birth('2022-01-10') })).resolves.toBe(
        CHILD
      );
    });

    describe('вік групи при зміні дати народження', () => {
      test('новий вік не збігається з віком групи -> 400, нічого не записано', async () => {
        const { repository, service } = createService();
        await expect(
          service.update(MANAGER, 5, { birthDate: birth('2023-05-05') })
        ).rejects.toThrow(
          'Дитина в групі «Сонечко» для 4-річних, а за новою датою народження їй 3'
        );
        expect(repository.findGroup).toHaveBeenCalledWith(3);
        expect(repository.update).not.toHaveBeenCalled();
      });

      test('новий вік збігається з віком групи -> зберігається', async () => {
        const { repository, service } = createService();
        await service.update(MANAGER, 5, { birthDate: birth('2022-01-10') });
        expect(repository.findGroup).toHaveBeenCalledWith(3);
        expect(repository.update).toHaveBeenCalledWith(5, { birthDate: birth('2022-01-10') });
      });

      test('дитина без групи: перевіряється лише діапазон віку', async () => {
        const { repository, service } = createService();
        repository.findById.mockResolvedValueOnce({ ...CHILD, groupId: null });
        await service.update(MANAGER, 5, { birthDate: birth('2023-05-05') });
        expect(repository.findGroup).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalled();
      });

      test('разом із деактивацією: дитина виходить із групи, вік групи не важливий', async () => {
        const { repository, service } = createService();
        await service.update(MANAGER, 5, { birthDate: birth('2023-05-05'), isActive: false });
        expect(repository.findGroup).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalledWith(5, {
          birthDate: birth('2023-05-05'),
          isActive: false,
          groupId: null,
        });
      });

      test('групу видалили між читанням дитини й перевіркою -> перевірка пропускається', async () => {
        const { repository, service } = createService();
        repository.findGroup.mockResolvedValueOnce(null);
        await expect(service.update(MANAGER, 5, { birthDate: birth('2023-05-05') })).resolves.toBe(
          CHILD
        );
      });
    });

    describe('повернення вибулої дитини (isActive: true)', () => {
      const INACTIVE = { ...CHILD, isActive: false, groupId: null };

      test('за час відсутності переросла MAX_AGE -> 400, нічого не записано', async () => {
        const { repository, service } = createService();
        repository.findById.mockResolvedValueOnce({ ...INACTIVE, birthDate: birth('2020-06-01') });
        await expect(service.update(MANAGER, 5, { isActive: true })).rejects.toThrow(
          'На 1 вересня дитині має бути від 2 до 5 років, а їй 6'
        );
        expect(repository.update).not.toHaveBeenCalled();
      });

      test('вік у межах -> повертається без групи', async () => {
        const { repository, service } = createService();
        repository.findById.mockResolvedValueOnce(INACTIVE);
        await service.update(MANAGER, 5, { isActive: true });
        expect(repository.update).toHaveBeenCalledWith(5, { isActive: true });
      });

      test('разом із новою датою народження перевіряється нова дата', async () => {
        const { repository, service } = createService();
        repository.findById.mockResolvedValueOnce({ ...INACTIVE, birthDate: birth('2020-06-01') });
        await service.update(MANAGER, 5, { isActive: true, birthDate: birth('2023-05-05') });
        expect(repository.findGroup).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalled();
      });

      test('isActive: true для вже активної дитини вік не перевіряє', async () => {
        const { repository, service } = createService();
        repository.findById.mockResolvedValueOnce({ ...CHILD, birthDate: birth('2020-06-01') });
        await expect(service.update(MANAGER, 5, { isActive: true })).resolves.toBe(CHILD);
      });
    });

    test('знижку змінює лише адмін', async () => {
      const { service } = createService();
      await expect(service.update(MANAGER, 5, { discountPercent: 10 })).rejects.toThrow(
        ForbiddenError
      );
      await expect(service.update(ADMIN, 5, { discountPercent: 10 })).resolves.toBe(CHILD);
    });

    test('оновлення без зміни знижки дозволене для дитини зі збереженою "старою" знижкою 30% при discountLevels [10, 20]', async () => {
      const { repository, settings, service } = createService();
      settings.get.mockReturnValue([10, 20]);
      repository.findById.mockResolvedValueOnce({ ...CHILD, discountPercent: 30 });

      // Зміна notes не перевіряє стару знижку
      await expect(service.update(MANAGER, 5, { notes: 'нова примітка' })).resolves.toBeDefined();

      // Передача тієї самої знижки не викидає помилку
      repository.findById.mockResolvedValueOnce({ ...CHILD, discountPercent: 30 });
      await expect(service.update(ADMIN, 5, { discountPercent: 30 })).resolves.toBeDefined();
    });

    test('зміна знижки на значення не зі списку discountLevels -> 400', async () => {
      const { repository, settings, service } = createService();
      settings.get.mockReturnValue([10, 20]);
      repository.findById.mockResolvedValueOnce({ ...CHILD, discountPercent: 10 });

      await expect(service.update(ADMIN, 5, { discountPercent: 40 })).rejects.toThrow(
        BadRequestError
      );
    });
  });

  describe('updateDiscount', () => {
    test('адмін успішно оновлює знижку на дозволену зі списку', async () => {
      const { repository, settings, service } = createService();
      settings.get.mockReturnValue([10, 20]);
      await expect(service.updateDiscount(ADMIN, 5, 10)).resolves.toEqual(CHILD);
      expect(repository.update).toHaveBeenCalledWith(5, { discountPercent: 10 });
    });

    test('знижка 0 дозволена завжди', async () => {
      const { repository, settings, service } = createService();
      settings.get.mockReturnValue([10, 20]);
      await expect(service.updateDiscount(ADMIN, 5, 0)).resolves.toEqual(CHILD);
      expect(repository.update).toHaveBeenCalledWith(5, { discountPercent: 0 });
    });

    test('спроба встановити знижку не зі списку -> 400', async () => {
      const { settings, service } = createService();
      settings.get.mockReturnValue([10, 20]);
      await expect(service.updateDiscount(ADMIN, 5, 30)).rejects.toThrow(BadRequestError);
    });

    test('не-адмін не може призначати знижку -> 403', async () => {
      const { service } = createService();
      await expect(service.updateDiscount(MANAGER, 5, 10)).rejects.toThrow(ForbiddenError);
      await expect(service.updateDiscount(PARENT, 5, 10)).rejects.toThrow(ForbiddenError);
    });

    test('неіснуюча дитина -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.updateDiscount(ADMIN, 99, 10)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deactivate', () => {
    test('м’яке видалення: isActive = false і groupId = null', async () => {
      const { repository, service } = createService();
      await expect(service.deactivate(MANAGER, 5)).resolves.toBeUndefined();
      expect(repository.update).toHaveBeenCalledWith(5, { isActive: false, groupId: null });
    });

    test('неіснуюча дитина -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.deactivate(ADMIN, 99)).rejects.toThrow(NotFoundError);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('помилки бази між перевіркою й записом', () => {
    const prismaError = (code) => Object.assign(new Error(code), { code });
    const data = { fullName: 'Іван', birthDate: birth('2022-03-15'), parentIds: [7] };

    test('батька видалили під час створення (P2003) -> 404', async () => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError('P2003'));
      await expect(service.create(MANAGER, data)).rejects.toThrow(NotFoundError);
    });

    test('батька видалили під час створення (P2025) -> 404 про батьків', async () => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.create(MANAGER, data)).rejects.toThrow('Батьків не знайдено');
    });

    test('дитину видалили під час оновлення або деактивації (P2025) -> 404', async () => {
      const { repository, service } = createService();
      repository.update.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.update(MANAGER, 5, { fullName: 'Олена' })).rejects.toThrow(
        'Дитину не знайдено'
      );
      repository.update.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.deactivate(MANAGER, 5)).rejects.toThrow(NotFoundError);
    });

    test('дитину видалили під час updateDiscount (P2025) -> 404', async () => {
      const { repository, service } = createService();
      repository.update.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.updateDiscount(ADMIN, 5, 10)).rejects.toThrow('Дитину не знайдено');
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.update.mockRejectedValueOnce(unknown);
      await expect(service.update(MANAGER, 5, { fullName: 'Олена' })).rejects.toBe(unknown);
    });
  });
});
