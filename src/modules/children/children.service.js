const { Role } = require('@prisma/client');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../errors/AppError');
const { ageOnSeptemberFirst, currentAcademicYear } = require('../../domain/age');
const { MIN_AGE, MAX_AGE } = require('../../domain/pricing');
const { settingsService } = require('../settings/settings.service');
const { childrenRepository } = require('./children.repository');

const NO_DISCOUNT = 0; // без пільги можна завжди, у DISCOUNT_LEVELS лише пільгові рівні
const ADMIN_ONLY_FIELDS = Object.freeze(['discountPercent', 'hasDeputyRelatives']); // пільги призначає лише адмін
const HIDDEN_FROM_PARENT = Object.freeze(['discountPercent', 'hasDeputyRelatives']);
const PARENT_EDITABLE_FIELDS = Object.freeze(['notes']); // батьки додають лише інфо про дитину

// Коди помилок Prisma: дані змінилися між перевіркою в сервісі й записом у базу
const FOREIGN_KEY_VIOLATION = 'P2003'; // батька видалили під час створення дитини
const RECORD_NOT_FOUND = 'P2025'; // дитину або батька видалили під час запису

const CHILD_NOT_FOUND = 'Дитину не знайдено';
const PARENT_NOT_FOUND = 'Батьків не знайдено';

/** Перекладає відомі помилки Prisma на помилки застосунку; решту повертає як є */
function translateDbError(error, notFoundMessage) {
  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return new NotFoundError(PARENT_NOT_FOUND);
  }
  if (error?.code === RECORD_NOT_FOUND) {
    return new NotFoundError(notFoundMessage);
  }
  return error;
}

class ChildrenService {
  /**
   * @param {object} repository
   * @param {{ get: (key: string) => * }} settings кеш налаштувань
   * @param {() => Date} now поточна дата (підміняється в тестах)
   */
  constructor(repository = childrenRepository, settings = settingsService, now = () => new Date()) {
    this.repository = repository;
    this.settings = settings;
    this.now = now;
  }

  /** Батьки бачать лише своїх дітей; для інших ролей обмеження немає */
  parentScope(user) {
    return user.role === Role.PARENT ? user.id : undefined;
  }

  /** Батькам не показуємо знижку й прапорець кумівства */
  toResponse(user, child) {
    if (user.role !== Role.PARENT) {
      return child;
    }
    const visible = { ...child };
    HIDDEN_FROM_PARENT.forEach((field) => delete visible[field]);
    return visible;
  }

  /** Вік на 1 вересня поточного навчального року має бути в межах MIN_AGE..MAX_AGE */
  assertAge(birthDate) {
    const age = ageOnSeptemberFirst(birthDate, currentAcademicYear(this.now()));
    if (age < MIN_AGE || age > MAX_AGE) {
      throw new BadRequestError(
        `На 1 вересня дитині має бути від ${MIN_AGE} до ${MAX_AGE} років, а їй ${age}`
      );
    }
  }

  /** Знижку й кумівство змінює лише адмін; знижка — 0 або один із рівнів у налаштуваннях */
  assertAdminFields(user, data) {
    const adminFields = ADMIN_ONLY_FIELDS.filter((field) => data[field] !== undefined);
    if (adminFields.length > 0 && user.role !== Role.ADMIN) {
      throw new ForbiddenError(`Лише адміністратор може змінювати: ${adminFields.join(', ')}`);
    }
    if (data.discountPercent !== undefined) {
      const allowed = [NO_DISCOUNT, ...this.settings.get('DISCOUNT_LEVELS')];
      if (!allowed.includes(data.discountPercent)) {
        throw new BadRequestError(
          `Знижка має бути одним зі значень ${allowed.join(', ')}, отримано ${data.discountPercent}`
        );
      }
    }
  }

  async findAccessible(user, id) {
    const child = await this.repository.findById(id, this.parentScope(user));
    if (!child) {
      throw new NotFoundError(CHILD_NOT_FOUND); // і для неіснуючої, і для чужої дитини
    }
    return child;
  }

  async list(user, filters = {}) {
    const children = await this.repository.findMany({
      ...filters,
      parentUserId: this.parentScope(user),
    });
    return children.map((child) => this.toResponse(user, child));
  }

  async getById(user, id) {
    return this.toResponse(user, await this.findAccessible(user, id));
  }

  async create(user, { parentIds, ...data }) {
    this.assertAge(data.birthDate);
    this.assertAdminFields(user, data);

    const uniqueParentIds = [...new Set(parentIds)];
    const existing = await this.repository.countParents(uniqueParentIds);
    if (existing !== uniqueParentIds.length) {
      throw new NotFoundError(PARENT_NOT_FOUND);
    }

    try {
      return this.toResponse(user, await this.repository.create(data, uniqueParentIds));
    } catch (error) {
      throw translateDbError(error, PARENT_NOT_FOUND);
    }
  }

  async update(user, id, data) {
    await this.findAccessible(user, id);

    if (user.role === Role.PARENT) {
      const forbidden = Object.keys(data).filter((key) => !PARENT_EDITABLE_FIELDS.includes(key));
      if (forbidden.length > 0) {
        throw new ForbiddenError('Батьки можуть змінювати лише примітки (notes)');
      }
    }
    if (data.birthDate !== undefined) {
      this.assertAge(data.birthDate);
    }
    this.assertAdminFields(user, data);

    try {
      return this.toResponse(user, await this.repository.update(id, data));
    } catch (error) {
      throw translateDbError(error, CHILD_NOT_FOUND);
    }
  }

  async deactivate(user, id) {
    await this.findAccessible(user, id);
    try {
      await this.repository.update(id, { isActive: false });
    } catch (error) {
      throw translateDbError(error, CHILD_NOT_FOUND);
    }
  }
}

const childrenService = new ChildrenService();

module.exports = { ChildrenService, childrenService };
