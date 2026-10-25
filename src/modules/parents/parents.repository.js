const { prisma } = require('../../config/prisma');

class ParentsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findAll({ search } = {}) {
    const where = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    return this.db.parent.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        children: {
          include: {
            child: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id) {
    return this.db.parent.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        children: {
          include: {
            child: true,
          },
        },
      },
    });
  }

  async findByUserId(userId) {
    return this.db.parent.findUnique({
      where: { userId },
      include: {
        children: {
          include: {
            child: true,
          },
        },
      },
    });
  }

  async findByPhone(phone) {
    return this.db.parent.findFirst({
      where: { phone },
    });
  }

  async create(data, tx) {
    const client = tx || this.db;
    return client.parent.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async update(id, data, tx) {
    const client = tx || this.db;
    return client.parent.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async delete(id, tx) {
    const client = tx || this.db;
    return client.parent.delete({
      where: { id },
    });
  }
}

const parentsRepository = new ParentsRepository();

module.exports = { ParentsRepository, parentsRepository };
