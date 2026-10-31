const { prisma } = require('../../config/prisma');

const SLOT_FIELDS = {
  id: true,
  groupId: true,
  dayOfWeek: true,
  startMinute: true,
  endMinute: true,
  activity: true,
  clubId: true,
};

const SLOT_SELECT = { ...SLOT_FIELDS, club: { select: { id: true, name: true } } };

const SLOT_ORDER = [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }, { groupId: 'asc' }];

const taughtBy = (userId) => ({ OR: [{ educator: { userId } }, { assistant: { userId } }] });

/** Які групи бачить користувач: вихователь — свої, батько — групи своїх дітей, решта — усі */
function groupAccess(user) {
  if (user.role === 'TEACHER') return taughtBy(user.id);
  if (user.role === 'PARENT') {
    return { children: { some: { parents: { some: { parent: { userId: user.id } } } } } };
  }
  return {};
}

class ScheduleRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findGroups() {
    return this.db.group.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  }

  async findClubs() {
    return this.db.club.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  }

  /** Повністю замінює розклад усіх груп однією транзакцією; повертає кількість створених слотів */
  async replaceAll(slots) {
    return this.db.$transaction(async (tx) => {
      await tx.scheduleSlot.deleteMany();
      const result = await tx.scheduleSlot.createMany({ data: slots });
      return result.count;
    });
  }

  async findAccessibleGroup(groupId, user) {
    return this.db.group.findFirst({
      where: { id: groupId, ...groupAccess(user) },
      select: { id: true, name: true, age: true },
    });
  }

  async findGroupSlots(groupId) {
    return this.db.scheduleSlot.findMany({
      where: { groupId },
      orderBy: SLOT_ORDER,
      select: SLOT_SELECT,
    });
  }

  /** Заняття викладача: слоти груп, де він вихователь чи помічник, і заняття його гуртка */
  async findTeacherSlots(userId) {
    return this.db.scheduleSlot.findMany({
      where: { OR: [{ group: taughtBy(userId) }, { club: { teacher: { userId } } }] },
      orderBy: SLOT_ORDER,
      select: { ...SLOT_SELECT, group: { select: { id: true, name: true } } },
    });
  }

  async findSlot(id) {
    return this.db.scheduleSlot.findUnique({ where: { id }, select: SLOT_FIELDS });
  }

  async findClub(id) {
    return this.db.club.findUnique({ where: { id }, select: { id: true } });
  }

  /** Слоти тієї самої групи та (якщо вказано) того самого гуртка: усе, з чим слот може конфліктувати */
  async findRelatedSlots(groupId, clubId) {
    const or = [{ groupId }];
    if (clubId !== null && clubId !== undefined) or.push({ clubId });
    return this.db.scheduleSlot.findMany({ where: { OR: or }, select: SLOT_FIELDS });
  }

  async updateSlot(id, data) {
    return this.db.scheduleSlot.update({ where: { id }, data, select: SLOT_SELECT });
  }

  async deleteByGroup(groupId) {
    const result = await this.db.scheduleSlot.deleteMany({ where: { groupId } });
    return result.count;
  }
}

const scheduleRepository = new ScheduleRepository();

module.exports = { ScheduleRepository, scheduleRepository, SLOT_FIELDS, SLOT_SELECT };
