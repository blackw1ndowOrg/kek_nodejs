const {
  SettingsService,
  settingsService,
  toConstantCase,
} = require('../../../src/modules/settings/settings.service');
const { AppError, BadRequestError, NotFoundError } = require('../../../src/errors/AppError');

function createService(rows = []) {
  const repository = {
    findAll: jest.fn().mockResolvedValue(rows),
    upsert: jest.fn(async (key, value) => ({ key, value })),
  };
  return { repository, service: new SettingsService(repository) };
}

let warnSpy;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SettingsService: початковий стан', () => {
  test('експортований екземпляр і toConstantCase', () => {
    expect(settingsService).toBeInstanceOf(SettingsService);
    expect(toConstantCase('tuitionMonthly')).toBe('TUITION_MONTHLY');
  });

  test('до load() доступні значення за замовчуванням', () => {
    const { service } = createService();
    expect(service.loaded).toBe(true);
    expect(service.get('TUITION_MONTHLY')).toBe(1500000);
    expect(service.get('DISCOUNT_LEVELS')).toEqual([10, 20, 30]);
  });

  test('кеш і масиви заморожені', () => {
    const { service } = createService();
    expect(Object.isFrozen(service.getAll())).toBe(true);
    expect(Object.isFrozen(service.get('DISCOUNT_LEVELS'))).toBe(true);
  });
});

describe('load', () => {
  test('повторні виклики не ходять у базу', async () => {
    const { repository, service } = createService();
    const first = await service.load();
    const second = await service.load();
    expect(second).toBe(first);
    expect(repository.findAll).toHaveBeenCalledTimes(1);
  });

  test('паралельні виклики ділять один запит', async () => {
    const { repository, service } = createService();
    await Promise.all([service.load(), service.load()]);
    expect(repository.findAll).toHaveBeenCalledTimes(1);
  });

  test('помилка скидає стан, наступний виклик пробує знову', async () => {
    const { repository, service } = createService();
    const error = new Error('db down');
    repository.findAll.mockRejectedValueOnce(error);
    await expect(service.load()).rejects.toBe(error);
    expect(service.loading).toBeNull();
    await expect(service.load()).resolves.toBeDefined();
    expect(repository.findAll).toHaveBeenCalledTimes(2);
  });
});

describe('refresh', () => {
  test('значення з бази перекривають дефолти, решта лишається за замовчуванням', async () => {
    const { service } = createService([{ key: 'tuitionMonthly', value: 1600000 }]);
    const cache = await service.refresh();
    expect(cache.TUITION_MONTHLY).toBe(1600000);
    expect(cache.MAX_GROUPS).toBe(30);
    expect(service.get('TUITION_MONTHLY')).toBe(1600000);
  });

  test('масиви з бази заморожуються', async () => {
    const { service } = createService([{ key: 'discountLevels', value: [5, 15] }]);
    await service.refresh();
    expect(service.get('DISCOUNT_LEVELS')).toEqual([5, 15]);
    expect(Object.isFrozen(service.get('DISCOUNT_LEVELS'))).toBe(true);
  });

  test('ключ у базі запам’ятовується в тому вигляді, в якому він у БД', async () => {
    const { repository, service } = createService([{ key: 'TUITION_MONTHLY', value: 1600000 }]);
    await service.refresh();
    await service.set('tuitionMonthly', 1700000);
    expect(repository.upsert).toHaveBeenCalledWith('TUITION_MONTHLY', 1700000);
  });

  test('невалідне значення в базі ігнорується з попередженням', async () => {
    const { service } = createService([{ key: 'tuitionMonthly', value: -5 }]);
    await service.refresh();
    expect(service.get('TUITION_MONTHLY')).toBe(1500000);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tuitionMonthly'));
  });

  test('невідомий ключ із бази потрапляє в кеш без валідації', async () => {
    const { service } = createService([{ key: 'customKey', value: 42 }]);
    await service.refresh();
    expect(service.get('CUSTOM_KEY')).toBe(42);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('повторний refresh повністю перебудовує кеш', async () => {
    const { repository, service } = createService([{ key: 'tuitionMonthly', value: 1600000 }]);
    await service.refresh();
    repository.findAll.mockResolvedValueOnce([]);
    await service.refresh();
    expect(service.get('TUITION_MONTHLY')).toBe(1500000);
  });

  test('помилка бази прокидається, кеш не змінюється', async () => {
    const { repository, service } = createService();
    repository.findAll.mockRejectedValueOnce(new Error('db down'));
    await expect(service.refresh()).rejects.toThrow('db down');
    expect(service.get('TUITION_MONTHLY')).toBe(1500000);
  });
});

describe('get і getAll', () => {
  test.each(['TUITION_MONTHLY', 'tuitionMonthly', 'tuition-monthly', ' tuitionMonthly '])(
    'ключ %p нормалізується',
    (key) => {
      const { service } = createService();
      expect(service.get(key)).toBe(1500000);
    }
  );

  test('невідомий ключ -> 404', () => {
    const { service } = createService();
    expect(() => service.get('NOPE')).toThrow(NotFoundError);
  });

  test('getAll повертає весь кеш', () => {
    const { service } = createService();
    expect(service.getAll()).toBe(service.cache);
    expect(service.getAll()).toHaveProperty('MAX_GROUPS', 30);
  });

  test('якщо налаштування не завантажені -> AppError', () => {
    const { service } = createService();
    service.loaded = false;
    expect(() => service.get('TUITION_MONTHLY')).toThrow(AppError);
    expect(() => service.getAll()).toThrow(AppError);
    expect(() => service.assertLoaded()).toThrow(/load\(\)/);
  });
});

describe('set', () => {
  test('пише в базу під її ключем і оновлює кеш; повертає ключ у CONSTANT_CASE', async () => {
    const { repository, service } = createService();
    await expect(service.set('tuitionMonthly', 1700000)).resolves.toEqual({
      key: 'TUITION_MONTHLY',
      value: 1700000,
    });
    expect(repository.upsert).toHaveBeenCalledWith('tuitionMonthly', 1700000);
    expect(service.get('TUITION_MONTHLY')).toBe(1700000);
  });

  test('кеш замінюється новим замороженим об’єктом', async () => {
    const { service } = createService();
    const before = service.getAll();
    await service.set('MAX_GROUPS', 40);
    expect(service.getAll()).not.toBe(before);
    expect(before.MAX_GROUPS).toBe(30);
    expect(Object.isFrozen(service.getAll())).toBe(true);
  });

  test('масив заморожується; у кеш іде значення, повернене базою', async () => {
    const { repository, service } = createService();
    repository.upsert.mockResolvedValueOnce({ key: 'discountLevels', value: [7, 17] });
    const result = await service.set('DISCOUNT_LEVELS', [5, 15]);
    expect(result.value).toEqual([7, 17]);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  test('невідомий ключ -> 404, база не чіпається', async () => {
    const { repository, service } = createService();
    await expect(service.set('NOPE', 5)).rejects.toThrow(NotFoundError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  test('якщо налаштування не завантажені -> AppError', async () => {
    const { service } = createService();
    service.loaded = false;
    await expect(service.set('MAX_GROUPS', 5)).rejects.toThrow(AppError);
  });

  test('помилка бази прокидається, кеш не змінюється', async () => {
    const { repository, service } = createService();
    repository.upsert.mockRejectedValueOnce(new Error('db down'));
    await expect(service.set('MAX_GROUPS', 40)).rejects.toThrow('db down');
    expect(service.get('MAX_GROUPS')).toBe(30);
  });

  describe('узгодженість порогу доплати й ліміту дітей', () => {
    test('поріг доплати більший за ліміт дітей -> 400', async () => {
      const { repository, service } = createService();
      await expect(service.set('GROUP_EXTRA_PAY_THRESHOLD', 21)).rejects.toThrow(BadRequestError);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    test('поріг доплати дорівнює ліміту дітей -> ок', async () => {
      const { service } = createService();
      await expect(service.set('GROUP_EXTRA_PAY_THRESHOLD', 20)).resolves.toBeDefined();
    });

    test('ліміт дітей менший за поріг доплати -> 400', async () => {
      const { repository, service } = createService();
      await expect(service.set('MAX_CHILDREN_IN_GROUP', 11)).rejects.toThrow(BadRequestError);
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    test('ліміт дітей дорівнює порогу доплати -> ок', async () => {
      const { service } = createService();
      await expect(service.set('MAX_CHILDREN_IN_GROUP', 12)).resolves.toBeDefined();
    });

    test('перевірка спирається на актуальний кеш', async () => {
      const { service } = createService();
      await service.set('MAX_CHILDREN_IN_GROUP', 30);
      await expect(service.set('GROUP_EXTRA_PAY_THRESHOLD', 25)).resolves.toBeDefined();
    });

    test('інші ключі не перевіряються на узгодженість', async () => {
      const { service } = createService();
      await expect(service.set('MAX_GROUPS', 1)).resolves.toBeDefined();
    });
  });
});
