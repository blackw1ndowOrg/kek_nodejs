const { Role, RoomType, StaffType } = require('@prisma/client');
const { BadRequestError, ConflictError, NotFoundError } = require('../../errors/AppError');
const { ageOnSeptemberFirst, currentAcademicYear } = require('../../domain/age');
const { settingsService } = require('../settings/settings.service');
const { groupsRepository } = require('./groups.repository');

// Коди помилок Prisma: дані змінилися між перевіркою в сервісі й записом у базу
const UNIQUE_VIOLATION = 'P2002'; // кімнату чи працівника щойно зайняла інша група
const FOREIGN_KEY_VIOLATION = 'P2003'; // кімнату чи працівника щойно видалили
const RECORD_NOT_FOUND = 'P2025'; // групу чи дитину щойно видалили

const GROUP_NOT_FOUND = 'Групу не знайдено';

/** Перекладає відомі помилки Prisma на помилки застосунку; решту повертає як є */
function translateDbError(error) {
  if (error?.code === UNIQUE_VIOLATION) {
    return new ConflictError('Кімнату або працівника вже призначено іншій групі');
  }
  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return new NotFoundError('Кімнату або працівника не знайдено');
  }
  if (error?.code === RECORD_NOT_FOUND) {
    return new NotFoundError('Групу або дитину не знайдено');
  }
  return error;
}

// Посада -> поле групи, у яке її призначають
const STAFF_SLOTS = Object.freeze({
  educatorId: { type: StaffType.EDUCATOR, takenBy: 'educatorOf' },
  assistantId: { type: StaffType.ASSISTANT, takenBy: 'assistantOf' },
});

class GroupsService {
  /**
   * @param {object} repository
   * @param {{ get: (key: string) => * }} settings кеш налаштувань
   * @param {() => Date} now поточна дата (підміняється в тестах)
   */
  constructor(repository = groupsRepository, settings = settingsService, now = () => new Date()) {
    this.repository = repository;
    this.settings = settings;
    this.now = now;
  }

  /** Вихователь бачить лише групи, де він вихователь або помічник; адмін і менеджер — усі */
  staffScope(user) {
    return user.role === Role.TEACHER ? user.id : undefined;
  }

  /** _count від Prisma -> зрозуміле поле childrenCount (лише активні діти) */
  toSummary({ _count, ...group }) {
    return { ...group, childrenCount: _count.children };
  }

  async findExisting(id) {
    const group = await this.repository.findRawById(id);
    if (!group) {
      throw new NotFoundError(GROUP_NOT_FOUND);
    }
    return group;
  }

  /** Кімната існує, призначена для груп і не зайнята іншою групою чи гуртком */
  async assertRoomAvailable(roomId, groupId) {
    const room = await this.repository.findRoom(roomId);
    if (!room) {
      throw new NotFoundError('Кімнату не знайдено');
    }
    if (room.type !== RoomType.GROUP) {
      throw new BadRequestError('Кімната не призначена для груп');
    }
    if (room.club) {
      throw new ConflictError('Кімнату вже займає гурток');
    }
    if (room.group && room.group.id !== groupId) {
      throw new ConflictError('Кімнату вже займає інша група');
    }
  }

  /** Працівник існує, активний, має потрібну посаду і не працює в іншій групі */
  async assertStaffAvailable(field, staffId, groupId) {
    const { type, takenBy } = STAFF_SLOTS[field];
    const staff = await this.repository.findStaff(staffId);
    if (!staff) {
      throw new NotFoundError('Працівника не знайдено');
    }
    if (staff.type !== type || !staff.isActive) {
      throw new BadRequestError(`Працівник ${staffId} має бути активним і мати посаду ${type}`);
    }
    const otherGroup = staff[takenBy];
    if (otherGroup && otherGroup.id !== groupId) {
      throw new ConflictError(`Працівник ${staffId} уже працює в іншій групі`);
    }
  }

  /** Перевіряє кімнату й персонал, які прийшли в тілі запиту (null — зняти з групи, не перевіряємо) */
  async assertAssignments(data, groupId) {
    if (data.roomId !== undefined) {
      await this.assertRoomAvailable(data.roomId, groupId);
    }
    for (const field of Object.keys(STAFF_SLOTS)) {
      if (data[field] !== undefined && data[field] !== null) {
        await this.assertStaffAvailable(field, data[field], groupId);
      }
    }
  }

  async list(user, filters = {}) {
    const groups = await this.repository.findMany({
      ...filters,
      staffUserId: this.staffScope(user),
    });
    return groups.map((group) => this.toSummary(group));
  }

  async getById(user, id) {
    const group = await this.repository.findById(id, this.staffScope(user));
    if (!group) {
      throw new NotFoundError(GROUP_NOT_FOUND); // і для неіснуючої, і для чужої групи
    }
    return group;
  }

  async create(data) {
    const maxGroups = this.settings.get('MAX_GROUPS');
    if ((await this.repository.count()) >= maxGroups) {
      throw new ConflictError(`Досягнуто ліміту груп: ${maxGroups}`);
    }
    await this.assertAssignments(data, undefined);
    try {
      return this.toSummary(await this.repository.create(data));
    } catch (error) {
      throw translateDbError(error);
    }
  }

  async update(id, data) {
    const group = await this.findExisting(id);
    if (data.age !== undefined && data.age !== group.age) {
      if ((await this.repository.countActiveChildren(id)) > 0) {
        throw new ConflictError('Не можна змінити вік групи, в якій є діти');
      }
    }
    await this.assertAssignments(data, id);
    try {
      return this.toSummary(await this.repository.update(id, data));
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /** Видалити можна лише групу без активних дітей; розклад групи видаляється каскадом */
  async delete(id) {
    await this.findExisting(id);
    if ((await this.repository.countActiveChildren(id)) > 0) {
      throw new ConflictError('Не можна видалити групу, в якій є діти');
    }
    try {
      await this.repository.delete(id);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /**
   * Зарахування (або переведення з іншої групи): дитина активна, її вік на 1 вересня
   * поточного навчального року дорівнює віку групи, у групі є місце.
   */
  async enrollChild(groupId, childId) {
    const group = await this.findExisting(groupId);
    const child = await this.repository.findChild(childId);
    if (!child) {
      throw new NotFoundError('Дитину не знайдено');
    }
    if (!child.isActive) {
      throw new BadRequestError('Дитина неактивна');
    }
    if (child.groupId === groupId) {
      throw new ConflictError('Дитина вже в цій групі');
    }

    const age = ageOnSeptemberFirst(child.birthDate, currentAcademicYear(this.now()));
    if (age !== group.age) {
      throw new BadRequestError(`На 1 вересня дитині ${age} років, а вік групи — ${group.age}`);
    }

    const maxChildren = this.settings.get('MAX_CHILDREN_IN_GROUP');
    let enrolled;
    try {
      enrolled = await this.repository.enrollChildIfCapacity(groupId, childId, maxChildren);
    } catch (error) {
      throw translateDbError(error);
    }
    if (!enrolled) {
      throw new ConflictError(`Групу заповнено: ${maxChildren} дітей`);
    }
  }

  async unenrollChild(groupId, childId) {
    await this.findExisting(groupId);
    const child = await this.repository.findChild(childId);
    if (!child || child.groupId !== groupId) {
      throw new NotFoundError('Дитини немає в цій групі');
    }
    try {
      await this.repository.unenrollChild(childId);
    } catch (error) {
      throw translateDbError(error);
    }
  }
}

const groupsService = new GroupsService();

module.exports = { GroupsService, groupsService };
