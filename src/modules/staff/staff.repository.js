const { prisma } = require('../../config/prisma');

class StaffRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findAll({ type, isActive, search } = {}) {
    const where = {};

    if (type) {
      where.type = type;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.fullName = { contains: search, mode: 'insensitive' };
    }

    return this.db.staff.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        educatorOf: {
          select: {
            id: true,
            name: true,
            age: true,
          },
        },
        assistantOf: {
          select: {
            id: true,
            name: true,
            age: true,
          },
        },
        clubTaught: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id) {
    return this.db.staff.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        educatorOf: {
          select: {
            id: true,
            name: true,
            age: true,
            children: {
              select: {
                id: true,
              },
            },
          },
        },
        assistantOf: {
          select: {
            id: true,
            name: true,
            age: true,
            children: {
              select: {
                id: true,
              },
            },
          },
        },
        clubTaught: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async create(data, tx) {
    const client = tx || this.db;
    return client.staff.create({
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
    return client.staff.update({
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
    return client.staff.delete({
      where: { id },
    });
  }
}

const staffRepository = new StaffRepository();

module.exports = { StaffRepository, staffRepository };
