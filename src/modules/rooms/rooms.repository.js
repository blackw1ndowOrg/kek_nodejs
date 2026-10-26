const { prisma } = require('../../config/prisma');

const roomSelect = {
  id: true,
  name: true,
  type: true,
  monthlyCost: true,
  group: { select: { id: true, name: true } },
  club: { select: { id: true, name: true } },
};

class RoomsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findMany({ type } = {}) {
    return this.db.room.findMany({
      where: type ? { type } : undefined,
      orderBy: { id: 'asc' },
      select: roomSelect,
    });
  }

  async findById(id) {
    return this.db.room.findUnique({ where: { id }, select: roomSelect });
  }

  async create(data) {
    return this.db.room.create({ data, select: roomSelect });
  }

  async update(id, data) {
    return this.db.room.update({ where: { id }, data, select: roomSelect });
  }

  async delete(id) {
    return this.db.room.delete({ where: { id } });
  }
}

const roomsRepository = new RoomsRepository();

module.exports = { RoomsRepository, roomsRepository };
