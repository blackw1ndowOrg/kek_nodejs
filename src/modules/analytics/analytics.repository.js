const { prisma } = require('../../config/prisma');

class AnalyticsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  /**
   * Знаходить групу за ID разом із закріпленою кімнатою та активними дітьми
   * @param {number} id
   */
  async findGroupById(id) {
    return this.db.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        age: true,
        roomId: true,
        room: {
          select: {
            id: true,
            name: true,
            monthlyCost: true,
          },
        },
        children: {
          where: { isActive: true },
          select: {
            id: true,
            fullName: true,
            discountPercent: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  /**
   * Отримує всіх активних дітей садка для розрахунку загального доходу
   */
  async findAllActiveChildren() {
    return this.db.child.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        discountPercent: true,
        groupId: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Отримує всі групи з їхніми закріпленими кімнатами та активними дітьми
   */
  async findAllGroupsWithActiveChildren() {
    return this.db.group.findMany({
      select: {
        id: true,
        name: true,
        age: true,
        roomId: true,
        room: {
          select: {
            id: true,
            name: true,
            monthlyCost: true,
          },
        },
        children: {
          where: { isActive: true },
          select: {
            id: true,
            fullName: true,
            discountPercent: true,
          },
          orderBy: { id: 'asc' },
        },
        _count: {
          select: {
            children: {
              where: { isActive: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }
}

const analyticsRepository = new AnalyticsRepository();

module.exports = {
  AnalyticsRepository,
  analyticsRepository,
};
