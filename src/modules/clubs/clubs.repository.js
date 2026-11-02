const { prisma } = require('../../config/prisma');

const CLUB_SELECT = {
  id: true,
  name: true,
  room: { select: { id: true, name: true, type: true } },
  teacher: { select: { id: true, fullName: true } },
};

class ClubsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findMany() {
    return this.db.club.findMany({ orderBy: { id: 'asc' }, select: CLUB_SELECT });
  }

  async findById(id) {
    return this.db.club.findUnique({ where: { id }, select: CLUB_SELECT });
  }

  /** Кімната разом із групою та гуртком, які її вже займають */
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

  /** Працівник разом із гуртком, який він уже веде */
  async findStaff(id) {
    return this.db.staff.findUnique({
      where: { id },
      select: { id: true, type: true, isActive: true, clubTaught: { select: { id: true } } },
    });
  }

  async create(data) {
    return this.db.club.create({ data, select: CLUB_SELECT });
  }

  async update(id, data) {
    return this.db.club.update({ where: { id }, data, select: CLUB_SELECT });
  }

  /**
   * Видаляє гурток разом зі слотами розкладу. У схемі ScheduleSlot.club має onDelete: SetNull,
   * тож без явного deleteMany у розкладі лишилися б заняття з clubId = null.
   */
  async delete(id) {
    await this.db.$transaction(async (tx) => {
      await tx.scheduleSlot.deleteMany({ where: { clubId: id } });
      await tx.club.delete({ where: { id } });
    });
  }
}

const clubsRepository = new ClubsRepository();

module.exports = { ClubsRepository, clubsRepository, CLUB_SELECT };
