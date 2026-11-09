const { prisma } = require('../../config/prisma');

// Лише запити до бази. Хто може бачити дитину й коли відсутність зараховується,
// вирішує absences.service.js

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

  /** date — 'YYYY-MM-DD': для поля @db.Date Prisma чекає Date (північ UTC) */
  async create({ childId, date, notifiedAt }) {
    return this.db.absence.create({
      data: { childId, date: new Date(date), notifiedAt },
      select: ABSENCE_SELECT,
    });
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

  async delete(id) {
    await this.db.absence.delete({ where: { id } });
  }
}

const absencesRepository = new AbsencesRepository();

module.exports = { AbsencesRepository, absencesRepository, ABSENCE_SELECT };
