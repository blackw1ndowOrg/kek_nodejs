const { prisma } = require('../../config/prisma');
const { withActor } = require('../../config/audit');

// Лише запити до бази. Хто може бачити дитину й коли відсутність зараховується,
// вирішує absences.service.js. Кожен запис іде через withActor: в історії змін ("AuditLog")
// видно, хто додав чи скасував відсутність

const ABSENCE_SELECT = Object.freeze({
  id: true,
  childId: true,
  date: true,
  notifiedAt: true,
});

class AbsencesRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  /**
   * date — 'YYYY-MM-DD': для поля @db.Date Prisma чекає Date (північ UTC)
   * @param {number} actorUserId хто додає (для історії змін)
   */
  async create({ childId, date, notifiedAt }, actorUserId) {
    return withActor(this.db, actorUserId, (tx) =>
      tx.absence.create({
        data: { childId, date: new Date(date), notifiedAt },
        select: ABSENCE_SELECT,
      })
    );
  }

  /** Відсутності дитини в межах [from, to), за датою */
  async findByChild(childId, { from, to }) {
    return this.db.absence.findMany({
      where: { childId, date: { gte: from, lt: to } },
      select: ABSENCE_SELECT,
      orderBy: { date: 'asc' },
    });
  }

  async findById(id) {
    return this.db.absence.findUnique({ where: { id }, select: ABSENCE_SELECT });
  }

  /**
   * Рядок видаляється, але його стан до видалення лишається в "AuditLog"
   * @param {number} actorUserId хто скасовує (для історії змін)
   */
  async delete(id, actorUserId) {
    await withActor(this.db, actorUserId, (tx) => tx.absence.delete({ where: { id } }));
  }
}

const absencesRepository = new AbsencesRepository();

module.exports = { AbsencesRepository, absencesRepository, ABSENCE_SELECT };
