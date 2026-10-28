const {
  SettingsRepository,
  settingsRepository,
} = require('../../../src/modules/settings/settings.repository');

function createRepository() {
  const db = {
    setting: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ key: 'k', value: 1 }),
      upsert: jest.fn().mockResolvedValue({ key: 'k', value: 1 }),
    },
  };
  return { db, repository: new SettingsRepository(db) };
}

describe('SettingsRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(settingsRepository).toBeInstanceOf(SettingsRepository);
  });

  test('findAll: сортування за ключем', async () => {
    const { db, repository } = createRepository();
    const rows = [{ key: 'a', value: 1 }];
    db.setting.findMany.mockResolvedValueOnce(rows);
    await expect(repository.findAll()).resolves.toBe(rows);
    expect(db.setting.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
  });

  test('update: оновлює значення за ключем', async () => {
    const { db, repository } = createRepository();
    await expect(repository.update('tuitionMonthly', 100)).resolves.toEqual({ key: 'k', value: 1 });
    expect(db.setting.update).toHaveBeenCalledWith({
      where: { key: 'tuitionMonthly' },
      data: { value: 100 },
    });
  });

  test('upsert: створює або оновлює', async () => {
    const { db, repository } = createRepository();
    await repository.upsert('discountLevels', [5, 15]);
    expect(db.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'discountLevels' },
      update: { value: [5, 15] },
      create: { key: 'discountLevels', value: [5, 15] },
    });
  });

  test('помилка бази прокидається', async () => {
    const { db, repository } = createRepository();
    const error = new Error('db down');
    db.setting.findMany.mockRejectedValueOnce(error);
    await expect(repository.findAll()).rejects.toBe(error);
  });
});
