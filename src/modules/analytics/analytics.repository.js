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
            paymentPlan: true,
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
        paymentPlan: true,
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
            paymentPlan: true,
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
  /**
   * Отримує кількість активних працівників садка за типами посад
   */
  async countActiveStaffByType() {
    const groups = await this.db.staff.groupBy({
      by: ['type'],
      where: { isActive: true },
      _count: { id: true },
    });
    const result = {
      CLUB_TEACHER: 0,
      MANAGER: 0,
      EDUCATOR: 0,
      ASSISTANT: 0,
    };
    for (const g of groups) {
      if (g.type in result) {
        result[g.type] = g._count.id;
      }
    }
    return result;
  }
}

const analyticsRepository = new AnalyticsRepository();

module.exports = {
  AnalyticsRepository,
  analyticsRepository,
};
