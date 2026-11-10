const {
  AbsencesService,
  absencesService,
} = require('../../../src/modules/absences/absences.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../../../src/errors/AppError');

const ADMIN = { id: 1, role: 'ADMIN' };
const MANAGER = { id: 2, role: 'MANAGER' };
const PARENT = { id: 12, role: 'PARENT' };

// Понеділок 09.11.2026, 07:00 за Києвом (05:00 UTC)
const NOW = new Date('2026-11-09T07:00:00+02:00');
const CHILD = Object.freeze({ id: 5, isActive: true, discountPercent: 30 });

const absence = (id, date, notifiedAt) => ({
  id,
  childId: 5,
  date: new Date(`${date}T00:00:00Z`),
  notifiedAt: new Date(notifiedAt),
});

function createService({ child = CHILD, now = () => NOW } = {}) {
  const repository = {
    create: jest.fn(async ({ date, notifiedAt }) => absence(1, date, notifiedAt.toISOString())),
    findByChild: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const children = { findById: jest.fn().mockResolvedValue(child) };
  const service = new AbsencesService(repository, children, now);
  return { repository, children, service };
}

const prismaError = (code) => Object.assign(new Error(code), { code });

afterEach(() => {
  jest.useRealTimers();
});

describe('AbsencesService', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(absencesService).toBeInstanceOf(AbsencesService);
    expect(absencesService.now()).toBeInstanceOf(Date);
  });

  describe('доступ до дитини', () => {
    test('батько шукає лише серед своїх дітей', async () => {
      const { children, service } = createService();
      await service.list(PARENT, 5, '2026-11');
      expect(children.findById).toHaveBeenCalledWith(5, 12);
    });

    test.each([
      ['ADMIN', ADMIN],
      ['MANAGER', MANAGER],
    ])('%s бачить будь-яку дитину', async (_role, user) => {
      const { children, service } = createService();
      await service.list(user, 5, '2026-11');
      expect(children.findById).toHaveBeenCalledWith(5, undefined);
    });

    test.each([
      ['create', (service) => service.create(PARENT, 5, '2026-11-12')],
      ['list', (service) => service.list(PARENT, 5, '2026-11')],
      ['remove', (service) => service.remove(PARENT, 5, 1)],
    ])('чужа або неіснуюча дитина -> 404 (%s)', async (_name, call) => {
      const { repository, service } = createService({ child: null });
      await expect(call(service)).rejects.toThrow('Дитину не знайдено');
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    test('notifiedAt ставить сервер; відповідь без даних дитини', async () => {
      const { repository, service } = createService();
      const result = await service.create(PARENT, 5, '2026-11-12');
      expect(repository.create).toHaveBeenCalledWith({
        childId: 5,
        date: '2026-11-12',
        notifiedAt: NOW,
      });
      expect(result).toEqual({
        id: 1,
        childId: 5,
        date: '2026-11-12',
        notifiedAt: NOW,
        counted: true,
      });
      expect(result).not.toHaveProperty('discountPercent');
    });

    test('сьогодні до 08:30 -> зараховано', async () => {
      const { service } = createService();
      await expect(service.create(PARENT, 5, '2026-11-09')).resolves.toMatchObject({
        counted: true,
      });
    });

    test('сьогодні після 08:30 -> записано, але не зараховано', async () => {
      const { service } = createService({ now: () => new Date('2026-11-09T10:00:00+02:00') });
      await expect(service.create(PARENT, 5, '2026-11-09')).resolves.toMatchObject({
        counted: false,
      });
    });

    test.each([
      ['субота', '2026-11-14'],
      ['неділя', '2026-11-15'],
    ])('%s -> 400', async (_name, date) => {
      const { repository, service } = createService();
      await expect(service.create(PARENT, 5, date)).rejects.toThrow(`${date} — вихідний`);
      expect(repository.create).not.toHaveBeenCalled();
    });

    test('дата в минулому -> 400', async () => {
      const { repository, service } = createService();
      await expect(service.create(PARENT, 5, '2026-11-06')).rejects.toThrow(
        'Дата 2026-11-06 уже минула: відсутність можна додати з 2026-11-09'
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    test('«сьогодні» рахується за Києвом: о 00:30 10.11 за Києвом 09.11 вже минуло', async () => {
      const { service } = createService({ now: () => new Date('2026-11-09T22:30:00Z') });
      await expect(service.create(PARENT, 5, '2026-11-09')).rejects.toThrow(BadRequestError);
      await expect(service.create(PARENT, 5, '2026-11-10')).resolves.toMatchObject({
        counted: true,
      });
    });

    test('дитина вибула -> 400', async () => {
      const { service } = createService({ child: { ...CHILD, isActive: false } });
      await expect(service.create(MANAGER, 5, '2026-11-12')).rejects.toThrow('Дитина вибула');
    });

    test('дубль на ту саму дату (P2002) -> 409', async () => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError('P2002'));
      await expect(service.create(PARENT, 5, '2026-11-12')).rejects.toThrow(
        new ConflictError('Відсутність на 2026-11-12 уже додано')
      );
    });

    test('дитину видалили під час запису (P2003) -> 404', async () => {
      const { repository, service } = createService();
      repository.create.mockRejectedValueOnce(prismaError('P2003'));
      await expect(service.create(ADMIN, 5, '2026-11-12')).rejects.toThrow(NotFoundError);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      const unknown = new Error('connection lost');
      repository.create.mockRejectedValueOnce(unknown);
      await expect(service.create(ADMIN, 5, '2026-11-12')).rejects.toBe(unknown);
    });
  });

  describe('межа 08:30 з fake timers (now за замовчуванням)', () => {
    const createAt = async (time) => {
      jest.useFakeTimers({ now: new Date(`2026-11-12T${time}+02:00`) });
      const repository = {
        create: jest.fn(async ({ date, notifiedAt }) => absence(1, date, notifiedAt.toISOString())),
      };
      const service = new AbsencesService(repository, {
        findById: jest.fn().mockResolvedValue(CHILD),
      });
      return service.create(PARENT, 5, '2026-11-12');
    };

    test('08:29:59 -> counted = true', async () => {
      await expect(createAt('08:29:59')).resolves.toMatchObject({ counted: true });
    });

    test('08:30:00 -> counted = false', async () => {
      await expect(createAt('08:30:00')).resolves.toMatchObject({ counted: false });
    });
  });

  describe('list', () => {
    test('місяць за замовчуванням — поточний за Києвом; counted для кожної', async () => {
      const { repository, service } = createService();
      repository.findByChild.mockResolvedValueOnce([
        absence(1, '2026-11-12', '2026-11-11T18:00:00Z'),
        absence(2, '2026-11-13', '2026-11-13T09:00:00Z'), // 11:00 за Києвом — пізно
      ]);
      const result = await service.list(MANAGER, 5);
      expect(repository.findByChild).toHaveBeenCalledWith(5, {
        from: new Date('2026-11-01T00:00:00Z'),
        to: new Date('2026-12-01T00:00:00Z'),
      });
      expect(result).toEqual({
        childId: 5,
        month: '2026-11',
        countedDays: 1,
        absences: [
          expect.objectContaining({ id: 1, date: '2026-11-12', counted: true }),
          expect.objectContaining({ id: 2, date: '2026-11-13', counted: false }),
        ],
      });
    });

    test('конкретний місяць', async () => {
      const { repository, service } = createService();
      await expect(service.list(PARENT, 5, '2026-10')).resolves.toMatchObject({
        month: '2026-10',
        countedDays: 0,
        absences: [],
      });
      expect(repository.findByChild).toHaveBeenCalledWith(5, {
        from: new Date('2026-10-01T00:00:00Z'),
        to: new Date('2026-11-01T00:00:00Z'),
      });
    });
  });

  describe('remove', () => {
    test('до 08:30 дня відсутності -> видалено', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(absence(7, '2026-11-09', '2026-11-08T18:00:00Z'));
      await expect(service.remove(PARENT, 5, 7)).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith(7);
    });

    test('о 08:30 дня відсутності і пізніше -> 409', async () => {
      const { repository, service } = createService({
        now: () => new Date('2026-11-09T08:30:00+02:00'),
      });
      repository.findById.mockResolvedValueOnce(absence(7, '2026-11-09', '2026-11-08T18:00:00Z'));
      await expect(service.remove(PARENT, 5, 7)).rejects.toThrow(
        'Відсутність на 2026-11-09 можна було скасувати лише до 08:30 цього дня'
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    test('відсутності немає -> 404', async () => {
      const { service } = createService();
      await expect(service.remove(ADMIN, 5, 99)).rejects.toThrow('Відсутність не знайдено');
    });

    test('відсутність іншої дитини -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce({
        ...absence(7, '2026-11-12', '2026-11-08T18:00:00Z'),
        childId: 6,
      });
      await expect(service.remove(ADMIN, 5, 7)).rejects.toThrow(NotFoundError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    test('видалили паралельним запитом (P2025) -> 404', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(absence(7, '2026-11-12', '2026-11-08T18:00:00Z'));
      repository.delete.mockRejectedValueOnce(prismaError('P2025'));
      await expect(service.remove(ADMIN, 5, 7)).rejects.toThrow(NotFoundError);
    });

    test('невідома помилка прокидається як є', async () => {
      const { repository, service } = createService();
      repository.findById.mockResolvedValueOnce(absence(7, '2026-11-12', '2026-11-08T18:00:00Z'));
      const unknown = new Error('connection lost');
      repository.delete.mockRejectedValueOnce(unknown);
      await expect(service.remove(ADMIN, 5, 7)).rejects.toBe(unknown);
    });
  });
});
