const {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require('../../errors/AppError');
const {
  ACTIVITY,
  ScheduleCapacityError,
  generateSchedule,
  validateSchedule,
} = require('../../domain/schedule');
const { scheduleRepository } = require('./schedule.repository');

// Prisma error codes
const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

const UNPROCESSABLE_ENTITY = 422;

// Доступ без обмежень (адмін): використовується, коли треба лише перевірити існування групи
const UNRESTRICTED = Object.freeze({ role: 'ADMIN' });

function translateDbError(error) {
  if (error?.code === UNIQUE_VIOLATION) {
    return new ConflictError('Слот із таким часом у цієї групи або гуртка вже існує');
  }
  if (error?.code === FOREIGN_KEY_VIOLATION) return new NotFoundError('Гурток не знайдено');
  if (error?.code === RECORD_NOT_FOUND) return new NotFoundError('Слот розкладу не знайдено');
  return error;
}

class ScheduleService {
  constructor(repository = scheduleRepository, generator = generateSchedule) {
    this.repository = repository;
    this.generator = generator;
  }

  /** Перегенерує розклад усіх груп; ручні правки замінюються */
  async generate() {
    const [groups, clubs] = await Promise.all([
      this.repository.findGroups(),
      this.repository.findClubs(),
    ]);

    let slots;
    try {
      slots = this.generator({ groups, clubs });
    } catch (error) {
      if (error instanceof ScheduleCapacityError) {
        throw new AppError(error.message, UNPROCESSABLE_ENTITY);
      }
      throw error;
    }

    const created = await this.repository.replaceAll(slots);
    return { groups: groups.length, clubs: clubs.length, slots: created };
  }

  /** Чужа або неіснуюча група -> 404 */
  async getGroupSchedule(user, groupId) {
    const group = await this.repository.findAccessibleGroup(groupId, user);
    if (!group) {
      throw new NotFoundError('Групу не знайдено');
    }
    const slots = await this.repository.findGroupSlots(groupId);
    return { group, slots };
  }

  async getMySchedule(user) {
    return this.repository.findTeacherSlots(user.id);
  }

  /**
   * Ручне редагування слота. Слот підставляється в розклад своєї групи й свого гуртка,
   * і якщо він порушує розклад (накладка в групі чи зайнятий кабінет) -> 409.
   * Конфлікти, які не стосуються цього слота, не блокують правку.
   */
  async updateSlot(id, data) {
    const slot = await this.repository.findSlot(id);
    if (!slot) {
      throw new NotFoundError('Слот розкладу не знайдено');
    }
    if (data.clubId !== undefined) {
      if (slot.activity !== ACTIVITY.CLUB) {
        throw new BadRequestError('Гурток можна призначити лише заняттю типу CLUB');
      }
      if (!(await this.repository.findClub(data.clubId))) {
        throw new NotFoundError('Гурток не знайдено');
      }
    }

    const updated = { ...slot, ...data };
    const related = await this.repository.findRelatedSlots(updated.groupId, updated.clubId);
    const others = related.filter((item) => item.id !== id);
    const conflicts = validateSchedule([...others, updated]).filter((conflict) =>
      conflict.slots.includes(updated)
    );
    if (conflicts.length > 0) {
      const types = [...new Set(conflicts.map((conflict) => conflict.type))];
      throw new ConflictError(`Конфлікт розкладу: ${types.join(', ')}`);
    }

    try {
      return await this.repository.updateSlot(id, data);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  async clearGroup(groupId) {
    const group = await this.repository.findAccessibleGroup(groupId, UNRESTRICTED);
    if (!group) {
      throw new NotFoundError('Групу не знайдено');
    }
    await this.repository.deleteByGroup(groupId);
  }
}

const scheduleService = new ScheduleService();

module.exports = { ScheduleService, scheduleService, translateDbError };
