const { prisma } = require('../../config/prisma');

// Лише запити до бази. Правила (хто що бачить, ліміти, вік) — у group.service.js.

const ACTIVE_CHILDREN = Object.freeze({ isActive: true });

const GROUP_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
  age: true,
  roomId: true,
  educatorId: true,
  assistantId: true,
  _count: { select: { children: { where: ACTIVE_CHILDREN } } },
});

const GROUP_DETAILS_SELECT = Object.freeze({
  id: true,
  name: true,
  age: true,
  room: { select: { id: true, name: true } },
  educator: { select: { id: true, fullName: true } },
  assistant: { select: { id: true, fullName: true } },
  children: {
    where: ACTIVE_CHILDREN,
    select: { id: true, fullName: true, birthDate: true },
    orderBy: { fullName: 'asc' },
  },
});

/** Умова «у цій групі працює вихователем або помічником користувач з цим userId» */
const taughtBy = (staffUserId) =>
  staffUserId === undefined
    ? {}
    : { OR: [{ educator: { userId: staffUserId } }, { assistant: { userId: staffUserId } }] };

class GroupsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findMany({ age, staffUserId } = {}) {
    return this.db.group.findMany({
      where: { age, ...taughtBy(staffUserId) },
      select: GROUP_SUMMARY_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** findFirst, бо findUnique не приймає умову на персонал. Чужа група -> null */
  async findById(id, staffUserId) {
    return this.db.group.findFirst({
      where: { id, ...taughtBy(staffUserId) },
      select: GROUP_DETAILS_SELECT,
    });
  }

  /** Сирий рядок групи (без зв'язків) — для перевірок у сервісі */
  async findRawById(id) {
    return this.db.group.findUnique({ where: { id } });
  }

  async count() {
    return this.db.group.count();
  }

  async countActiveChildren(groupId) {
    return this.db.child.count({ where: { groupId, ...ACTIVE_CHILDREN } });
  }

  /** Кімната і група або гурток, які її займають (якщо є) */
  async findRoom(id) {
    return this.db.room.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        group: { select: { id: true } },
        club: { select: { id: true } },
      },
    });
  }

  /** Працівник і групи, де він уже вихователь чи помічник (якщо є) */
  async findStaff(id) {
    return this.db.staff.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        isActive: true,
        educatorOf: { select: { id: true } },
        assistantOf: { select: { id: true } },
      },
    });
  }

  async findChild(id) {
    return this.db.child.findUnique({
      where: { id },
      select: { id: true, birthDate: true, isActive: true, groupId: true },
    });
  }

  async create(data) {
    return this.db.group.create({ data, select: GROUP_SUMMARY_SELECT });
  }

  async update(id, data) {
    return this.db.group.update({ where: { id }, data, select: GROUP_SUMMARY_SELECT });
  }

  async delete(id) {
    await this.db.group.delete({ where: { id } });
  }

  /**
   * Атомарно зараховує дитину, якщо в групі є місце.
   * Рядок групи блокується (SELECT ... FOR UPDATE) до кінця транзакції, тому два одночасні
   * зарахування в ту саму групу виконуються по черзі й не перевищать ліміт.
   *
   * @returns {Promise<boolean>} false, якщо група вже заповнена
   */
  async enrollChildIfCapacity(groupId, childId, maxChildren) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
      const enrolled = await tx.child.count({ where: { groupId, ...ACTIVE_CHILDREN } });
      if (enrolled >= maxChildren) {
        return false;
      }
      await tx.child.update({ where: { id: childId }, data: { groupId } });
      return true;
    });
  }

  async unenrollChild(childId) {
    await this.db.child.update({ where: { id: childId }, data: { groupId: null } });
  }
}

const groupsRepository = new GroupsRepository();

module.exports = { GroupsRepository, groupsRepository, GROUP_SUMMARY_SELECT, GROUP_DETAILS_SELECT };
