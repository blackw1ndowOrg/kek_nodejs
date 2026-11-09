const { Role } = require('@prisma/client');
const { BadRequestError, ConflictError, NotFoundError } = require('../../errors/AppError');
const {
  toIsoDate,
  noticeDeadline,
  isCounted,
  localDateIso,
  localMonth,
  isWeekend,
  monthRange,
} = require('../../domain/absence');
const { childrenRepository } = require('../children/children.repository');
const { absencesRepository } = require('./absences.repository');

// Коди помилок Prisma: дані змінилися між перевіркою в сервісі й записом у базу
const UNIQUE_VIOLATION = 'P2002'; // відсутність на цю дату вже додали паралельним запитом
const RECORD_NOT_FOUND = 'P2025'; // відсутність уже видалили
const FOREIGN_KEY_VIOLATION = 'P2003'; // дитину видалили під час створення

const CHILD_NOT_FOUND = 'Дитину не знайдено';
const ABSENCE_NOT_FOUND = 'Відсутність не знайдено';

class AbsencesService {
  /**
   * @param {object} repository
   * @param {object} children репозиторій дітей: перевірка доступу батьків
   * @param {() => Date} now поточний момент (підміняється в тестах)
   */
  constructor(
    repository = absencesRepository,
    children = childrenRepository,
    now = () => new Date()
  ) {
    this.repository = repository;
    this.children = children;
    this.now = now;
  }

  /** Батьки бачать лише своїх дітей: чужа дитина -> 404, як і неіснуюча */
  async loadChild(user, childId) {
    const parentUserId = user.role === Role.PARENT ? user.id : undefined;
    const child = await this.children.findById(childId, parentUserId);
    if (!child) {
      throw new NotFoundError(CHILD_NOT_FOUND);
    }
    return child;
  }

  /** Лише дані відсутності й обчислюване counted: знижок і даних дитини у відповіді немає */
  toResponse(absence) {
    return {
      id: absence.id,
      childId: absence.childId,
      date: toIsoDate(absence.date),
      notifiedAt: absence.notifiedAt,
      counted: isCounted(absence),
    };
  }

  async create(user, childId, date) {
    const child = await this.loadChild(user, childId);
    if (!child.isActive) {
      throw new BadRequestError('Дитина вибула з садка: відсутність не потрібна');
    }
    if (isWeekend(date)) {
      throw new BadRequestError(`${date} — вихідний, садок не працює`);
    }
    const now = this.now();
    const today = localDateIso(now);
    if (date < today) {
      throw new BadRequestError(`Дата ${date} уже минула: відсутність можна додати з ${today}`);
    }

    try {
      const absence = await this.repository.create({ childId, date, notifiedAt: now }, user.id);
      return this.toResponse(absence);
    } catch (error) {
      if (error?.code === UNIQUE_VIOLATION) {
        throw new ConflictError(`Відсутність на ${date} уже додано`);
      }
      if (error?.code === FOREIGN_KEY_VIOLATION) {
        throw new NotFoundError(CHILD_NOT_FOUND);
      }
      throw error;
    }
  }

  /** Відсутності за місяць (за замовчуванням поточний) і скільки з них зараховано */
  async list(user, childId, month = localMonth(this.now())) {
    await this.loadChild(user, childId);
    const absences = (await this.repository.findByChild(childId, monthRange(month))).map(
      (absence) => this.toResponse(absence)
    );
    return {
      childId,
      month,
      countedDays: absences.filter((absence) => absence.counted).length,
      absences,
    };
  }

  /** Скасувати можна до 08:30 дня відсутності: після цього харчування вже заплановане */
  async remove(user, childId, absenceId) {
    await this.loadChild(user, childId);
    const absence = await this.repository.findById(absenceId);
    if (!absence || absence.childId !== childId) {
      throw new NotFoundError(ABSENCE_NOT_FOUND);
    }
    if (this.now().getTime() >= noticeDeadline(absence.date).getTime()) {
      throw new ConflictError(
        `Відсутність на ${toIsoDate(absence.date)} можна було скасувати лише до 08:30 цього дня`
      );
    }

    try {
      await this.repository.delete(absenceId, user.id);
    } catch (error) {
      if (error?.code === RECORD_NOT_FOUND) {
        throw new NotFoundError(ABSENCE_NOT_FOUND);
      }
      throw error;
    }
  }
}

const absencesService = new AbsencesService();

module.exports = { AbsencesService, absencesService };
