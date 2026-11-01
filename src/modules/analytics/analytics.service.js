const { NotFoundError } = require('../../errors/AppError');
const { tuitionMonthly } = require('../../domain/pricing');
const {
  educatorSalary,
  assistantSalary,
  clubTeacherSalary,
  managerSalary,
} = require('../../domain/salary');
const { toMoney } = require('../../domain/money');
const { settingsService } = require('../settings/settings.service');
const { analyticsRepository } = require('./analytics.repository');

const DEFAULT_CLUB_TEACHERS_COUNT = 5;
const DEFAULT_MANAGERS_COUNT = 1;
const DEFAULT_TOTAL_ROOMS_COUNT = 20;

class AnalyticsService {
  constructor(repository = analyticsRepository, settings = settingsService) {
    this.repository = repository;
    this.settings = settings;
  }

  /**
   * Розрахунок профіту окремої групи:
   * - Дохід: сума щомісячної оплати за навчання всіх активних дітей групи з урахуванням пільг
   * - Витрати: зарплата вихователя (за кількістю дітей) + зарплата помічника + оренда закріпленої кімнати (50 000 грн)
   * - Профіт: дохід - витрати
   *
   * @param {number} groupId
   */
  async getGroupProfit(groupId) {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError('Групу не знайдено');
    }

    const tuition = this.settings.get('TUITION_MONTHLY');
    const discountLevels = this.settings.get('DISCOUNT_LEVELS');
    const educatorRate = this.settings.get('EDUCATOR_PER_CHILD');
    const educatorExtra = this.settings.get('EDUCATOR_EXTRA_PAY');
    const assistantBase = this.settings.get('ASSISTANT_SALARY');
    const assistantExtra = this.settings.get('ASSISTANT_EXTRA_PAY');
    const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
    const defaultRoomCost = this.settings.get('ROOM_MONTHLY_COST');

    const activeChildren = group.children;
    const childrenCount = activeChildren.length;

    let tuitionIncome = 0;
    for (const child of activeChildren) {
      tuitionIncome += tuitionMonthly(child.discountPercent, tuition, discountLevels);
    }

    const educator = educatorSalary(childrenCount, educatorRate, educatorExtra, threshold);
    const assistant = assistantSalary(childrenCount, assistantBase, assistantExtra, threshold);
    const roomCost = group.room ? group.room.monthlyCost : defaultRoomCost;

    const totalExpenses = educator + assistant + roomCost;
    const profit = tuitionIncome - totalExpenses;

    const incomeBreakdown = {
      tuition: toMoney(tuitionIncome),
      total: toMoney(tuitionIncome),
      ...toMoney(tuitionIncome),
    };

    const expensesBreakdown = {
      educatorSalary: toMoney(educator),
      assistantSalary: toMoney(assistant),
      roomRent: toMoney(roomCost),
      roomCost: toMoney(roomCost),
      total: toMoney(totalExpenses),
      ...toMoney(totalExpenses),
    };

    const profitMoney = toMoney(profit);

    return {
      groupId: group.id,
      groupName: group.name,
      childrenCount,
      room: {
        id: group.room ? group.room.id : group.roomId,
        name: group.room ? group.room.name : null,
        cost: toMoney(roomCost),
      },
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: profitMoney,
      breakdown: {
        income: {
          tuition: toMoney(tuitionIncome),
          total: toMoney(tuitionIncome),
        },
        expenses: {
          educatorSalary: toMoney(educator),
          assistantSalary: toMoney(assistant),
          roomRent: toMoney(roomCost),
          total: toMoney(totalExpenses),
        },
      },
    };
  }

  /**
   * Розрахунок загального профіту всього садка:
   * - Загальний дохід: сума оплат за навчання всіх активних дітей у садку
   * - Загальні витрати: зарплати всіх вихователів + помічників + 5 викладачів гуртків по 40 000 грн
   *   + менеджер 80 000 грн + оренда всіх 20 кімнат садка по 50 000 грн (1 000 000 грн)
   * - Чистий профіт: загальний дохід - загальні витрати
   */
  async getTotalProfit() {
    const tuition = this.settings.get('TUITION_MONTHLY');
    const discountLevels = this.settings.get('DISCOUNT_LEVELS');
    const educatorRate = this.settings.get('EDUCATOR_PER_CHILD');
    const educatorExtra = this.settings.get('EDUCATOR_EXTRA_PAY');
    const assistantBase = this.settings.get('ASSISTANT_SALARY');
    const assistantExtra = this.settings.get('ASSISTANT_EXTRA_PAY');
    const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
    const clubSalary = this.settings.get('CLUB_TEACHER_SALARY');
    const mgrSalary = this.settings.get('MANAGER_SALARY');
    const roomCostSetting = this.settings.get('ROOM_MONTHLY_COST');
    const roomsCountSetting = this.settings.get('DEFAULT_ROOMS_COUNT');

    const activeChildren = await this.repository.findAllActiveChildren();
    let totalTuitionIncome = 0;
    for (const child of activeChildren) {
      totalTuitionIncome += tuitionMonthly(child.discountPercent, tuition, discountLevels);
    }

    const groups = await this.repository.findAllGroupsWithActiveChildren();
    let totalEducatorsSalary = 0;
    let totalAssistantsSalary = 0;

    const defaultRoomCost = roomCostSetting;

    const groupsBreakdown = groups.map((g) => {
      const activeGroupChildren = g.children;
      const count = activeGroupChildren.length;
      const educator = educatorSalary(count, educatorRate, educatorExtra, threshold);
      const assistant = assistantSalary(count, assistantBase, assistantExtra, threshold);
      const roomCost = g.room ? g.room.monthlyCost : defaultRoomCost;

      totalEducatorsSalary += educator;
      totalAssistantsSalary += assistant;

      let gTuition = 0;
      for (const child of activeGroupChildren) {
        gTuition += tuitionMonthly(child.discountPercent, tuition, discountLevels);
      }
      const gExpenses = educator + assistant + roomCost;

      return {
        groupId: g.id,
        groupName: g.name,
        childrenCount: count,
        income: toMoney(gTuition),
        expenses: toMoney(gExpenses),
        profit: toMoney(gTuition - gExpenses),
      };
    });

    const clubTeachersCount = DEFAULT_CLUB_TEACHERS_COUNT;
    const totalClubTeachersSalary = clubTeachersCount * clubTeacherSalary(clubSalary);

    const managersCount = DEFAULT_MANAGERS_COUNT;
    const totalManagerSalary = managersCount * managerSalary(mgrSalary);

    const totalStaffSalaries =
      totalEducatorsSalary + totalAssistantsSalary + totalClubTeachersSalary + totalManagerSalary;

    const roomsCount = roomsCountSetting;
    const totalRoomsRent = roomsCount * defaultRoomCost;

    const totalExpenses = totalStaffSalaries + totalRoomsRent;
    const totalProfit = totalTuitionIncome - totalExpenses;

    const incomeBreakdown = {
      tuition: toMoney(totalTuitionIncome),
      total: toMoney(totalTuitionIncome),
      ...toMoney(totalTuitionIncome),
    };

    const expensesBreakdown = {
      educatorsSalary: toMoney(totalEducatorsSalary),
      assistantsSalary: toMoney(totalAssistantsSalary),
      clubTeachersSalary: toMoney(totalClubTeachersSalary),
      managerSalary: toMoney(totalManagerSalary),
      staffSalaries: toMoney(totalStaffSalaries),
      allStaffSalaries: toMoney(totalStaffSalaries),
      roomsRent: toMoney(totalRoomsRent),
      roomsCost: toMoney(totalRoomsRent),
      total: toMoney(totalExpenses),
      ...toMoney(totalExpenses),
    };

    const profitMoney = toMoney(totalProfit);

    return {
      activeChildrenCount: activeChildren.length,
      groupsCount: groups.length,
      roomsCount,
      clubTeachersCount,
      managersCount,
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: profitMoney,
      netProfit: profitMoney,
      breakdown: {
        income: {
          tuition: toMoney(totalTuitionIncome),
          total: toMoney(totalTuitionIncome),
        },
        expenses: {
          educatorsSalary: toMoney(totalEducatorsSalary),
          assistantsSalary: toMoney(totalAssistantsSalary),
          clubTeachersSalary: toMoney(totalClubTeachersSalary),
          managerSalary: toMoney(totalManagerSalary),
          staffSalaries: toMoney(totalStaffSalaries),
          roomsRent: toMoney(totalRoomsRent),
          total: toMoney(totalExpenses),
        },
      },
      groups: groupsBreakdown,
    };
  }
}

const analyticsService = new AnalyticsService();

module.exports = {
  AnalyticsService,
  analyticsService,
  toMoney,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  DEFAULT_TOTAL_ROOMS_COUNT,
};