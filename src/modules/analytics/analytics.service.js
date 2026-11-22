const { NotFoundError, BadRequestError } = require('../../errors/AppError');
const { mealMonthly, calculateChildMonthlyTuition } = require('../../domain/pricing');
const {
  educatorSalary,
  assistantSalary,
  clubTeacherSalary,
  managerSalary,
} = require('../../domain/salary');
const { optimizeKindergartenCapacity } = require('../../domain/forecast');
const { currentMonth, workingDaysInMonth } = require('../../domain/calendar');
const {
  ACTIVITY,
  ScheduleCapacityError,
  generateSchedule,
  validateSchedule,
  maxGroupsFor,
} = require('../../domain/schedule');
const { toMoney } = require('../../domain/money');
const { settingsService } = require('../settings/settings.service');
const { analyticsRepository } = require('./analytics.repository');

const DEFAULT_CLUB_TEACHERS_COUNT = 5;
const DEFAULT_MANAGERS_COUNT = 1;
const DEFAULT_TOTAL_ROOMS_COUNT = 20;
const DEFAULT_CLUB_ROOMS_COUNT = 5;

const DEFAULT_CLUBS = Object.freeze([
  { id: 1, name: 'Музика' },
  { id: 2, name: 'Англійська' },
  { id: 3, name: 'Шахи' },
  { id: 4, name: 'Спорт' },
  { id: 5, name: 'Малювання' },
]);
const TEACHER_WEEKLY_CAPACITY = 45; // 9 занять на день × 5 робочих днів на тиждень

function isStaffActive(staffRelation, staffId) {
  if (staffId === null || staffRelation === null) {
    return false;
  }
  if (staffRelation !== undefined && staffRelation !== null) {
    if (staffRelation.isActive !== undefined) {
      return Boolean(staffRelation.isActive);
    }
  }
  return staffId !== null && staffId !== undefined;
}

class AnalyticsService {
  /**
   * @param {object} repository
   * @param {object} settings
   * @param {() => Date} now поточний момент: від нього рахується поточний місяць (підміняється в тестах)
   */
  constructor(
    repository = analyticsRepository,
    settings = settingsService,
    now = () => new Date(),
    scheduleGenerator = generateSchedule
  ) {
    this.repository = repository;
    this.settings = settings;
    this.now = now;
    this.scheduleGenerator = scheduleGenerator;
  }

  /**
   * Коефіцієнт відвідуваності: query-параметр перекриває налаштування.
   * В налаштуваннях зберігається цілий відсоток (80), тут перетворюється на 0.8
   */
  resolveAttendanceRate(query = {}) {
    if (query.attendanceRate !== undefined) {
      return Number(query.attendanceRate);
    }
    return this.settings.get('ATTENDANCE_RATE_PERCENT') / 100;
  }

  /**
   * Місяць розрахунку та його робочі дні (Пн–Пт мінус свята з HOLIDAYS).
   * Від них залежить харчування; без month — поточний місяць за Києвом
   *
   * @param {string} [month] 'YYYY-MM'
   * @returns {{ month: string, workingDays: number }}
   */
  resolveCalendar(month) {
    const resolvedMonth = month ?? currentMonth(this.now());
    return {
      month: resolvedMonth,
      workingDays: workingDaysInMonth(resolvedMonth, this.settings.get('HOLIDAYS')),
    };
  }

  /**
   * Розрахунок профіту окремої групи:
   * - Дохід: сума щомісячної оплати за навчання та харчування за віком групи для всіх активних дітей
   *   (харчування — за робочими днями місяця query.month, за замовчуванням поточного)
   * - Витрати: зарплата вихователя (за кількістю дітей) + зарплата помічника + оренда закріпленої кімнати (50 000 грн)
   * - Профіт: дохід - витрати
   *
   * @param {number|string} groupId
   * @param {Object} [query={}]
   */
  async getGroupProfit(groupId, query = {}) {
    const id = Number(groupId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Group ID must be a positive integer');
    }

    const group = await this.repository.findGroupById(id);
    if (!group) {
      throw new NotFoundError('Групу не знайдено');
    }

    const attendanceRate = this.resolveAttendanceRate(query);
    const tuition = this.settings.get('TUITION_MONTHLY');
    const discountLevels = this.settings.get('DISCOUNT_LEVELS');
    const yearlyDiscountPercent = this.settings.get('YEARLY_DISCOUNT_PERCENT') ?? 12;
    const educatorRate = this.settings.get('EDUCATOR_PER_CHILD');
    const educatorExtra = this.settings.get('EDUCATOR_EXTRA_PAY');
    const assistantBase = this.settings.get('ASSISTANT_SALARY');
    const assistantExtra = this.settings.get('ASSISTANT_EXTRA_PAY');
    const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
    const defaultRoomCost = this.settings.get('ROOM_MONTHLY_COST');
    const mealBase = this.settings.get('MEAL_BASE_PER_DAY');
    const mealExtra = this.settings.get('MEAL_PER_EXTRA_YEAR');
    const calendar = this.resolveCalendar(query.month);
    const { workingDays } = calendar;

    const activeChildren = group.children || [];
    const childrenCount = group._count?.children ?? activeChildren.length;

    let tuitionIncome = 0;
    for (const child of activeChildren) {
      tuitionIncome += calculateChildMonthlyTuition(
        child,
        tuition,
        discountLevels,
        yearlyDiscountPercent
      );
    }
    const fullMonthMeal = group.age ? mealMonthly(group.age, workingDays, mealBase, mealExtra) : 0;
    const mealPerChild = Math.round(fullMonthMeal * attendanceRate);
    const mealIncome = childrenCount * mealPerChild;
    const totalIncome = tuitionIncome + mealIncome;

    const hasEducator = isStaffActive(group.educator, group.educatorId);
    const hasAssistant = isStaffActive(group.assistant, group.assistantId);

    const educator = hasEducator
      ? educatorSalary(childrenCount, educatorRate, educatorExtra, threshold)
      : 0;
    const assistant = hasAssistant
      ? assistantSalary(childrenCount, assistantBase, assistantExtra, threshold)
      : 0;
    const roomCost = group.room ? group.room.monthlyCost : defaultRoomCost;

    const totalExpenses = educator + assistant + roomCost;
    const profit = totalIncome - totalExpenses;

    const incomeBreakdown = {
      tuition: toMoney(tuitionIncome),
      meal: toMoney(mealIncome),
      total: toMoney(totalIncome),
    };

    const expensesBreakdown = {
      educatorSalary: toMoney(educator),
      assistantSalary: toMoney(assistant),
      roomRent: toMoney(roomCost),
      total: toMoney(totalExpenses),
    };

    const profitMoney = toMoney(profit);

    return {
      groupId: group.id,
      groupName: group.name,
      age: group.age,
      childrenCount,
      room: {
        id: group.room ? group.room.id : group.roomId,
        name: group.room ? group.room.name : null,
        cost: toMoney(roomCost),
      },
      tuitionIncome: toMoney(tuitionIncome),
      mealIncome: toMoney(mealIncome),
      totalIncome: toMoney(totalIncome),
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: profitMoney,
      breakdown: {
        income: incomeBreakdown,
        expenses: expensesBreakdown,
      },
      calendar,
    };
  }

  /**
   * Розрахунок загального профіту всього садка:
   * - Доходи: сума навчання та харчування дітей, зарахованих до груп
   *   (харчування — за робочими днями місяця query.month, за замовчуванням поточного)
   * - Витрати: фактичні зарплати вихователів + помічників + викладачі гуртків
   *   + менеджери + оренда всіх 20 кімнат (з розмежуванням на операційні та простій)
   * - Чистий профіт: загальний дохід - загальні витрати
   *
   * @param {Object} [query={}]
   */
  async getTotalProfit(query = {}) {
    const attendanceRate = this.resolveAttendanceRate(query);
    const tuition = this.settings.get('TUITION_MONTHLY');
    const discountLevels = this.settings.get('DISCOUNT_LEVELS');
    const yearlyDiscountPercent = this.settings.get('YEARLY_DISCOUNT_PERCENT') ?? 12;
    const educatorRate = this.settings.get('EDUCATOR_PER_CHILD');
    const educatorExtra = this.settings.get('EDUCATOR_EXTRA_PAY');
    const assistantBase = this.settings.get('ASSISTANT_SALARY');
    const assistantExtra = this.settings.get('ASSISTANT_EXTRA_PAY');
    const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
    const clubSalary = this.settings.get('CLUB_TEACHER_SALARY');
    const mgrSalary = this.settings.get('MANAGER_SALARY');
    const roomCostSetting = this.settings.get('ROOM_MONTHLY_COST');
    const roomsCountSetting = this.settings.get('DEFAULT_ROOMS_COUNT');
    const mealBase = this.settings.get('MEAL_BASE_PER_DAY');
    const mealExtra = this.settings.get('MEAL_PER_EXTRA_YEAR');
    const calendar = this.resolveCalendar(query.month);
    const { workingDays } = calendar;
    const defaultRoomCost = roomCostSetting;
    const roomsCount = roomsCountSetting;

    const groups = await this.repository.findAllGroupsWithActiveChildren();
    let totalEducatorsSalary = 0;
    let totalAssistantsSalary = 0;
    let groupsTuitionIncome = 0;
    let totalMealIncome = 0;
    let totalOccupiedGroupRoomsRent = 0;
    let totalAssignedChildrenCount = 0;
    let assignedActiveEducatorsCount = 0;
    let assignedActiveAssistantsCount = 0;

    const groupsBreakdown = groups.map((g) => {
      const activeGroupChildren = g.children || [];
      const count = g._count?.children ?? activeGroupChildren.length;
      totalAssignedChildrenCount += count;
      const hasEducator = isStaffActive(g.educator, g.educatorId);
      const hasAssistant = isStaffActive(g.assistant, g.assistantId);

      if (hasEducator) assignedActiveEducatorsCount++;
      if (hasAssistant) assignedActiveAssistantsCount++;

      const educator = hasEducator
        ? educatorSalary(count, educatorRate, educatorExtra, threshold)
        : 0;
      const assistant = hasAssistant
        ? assistantSalary(count, assistantBase, assistantExtra, threshold)
        : 0;
      const roomCost = g.room ? g.room.monthlyCost : defaultRoomCost;

      totalEducatorsSalary += educator;
      totalAssistantsSalary += assistant;
      totalOccupiedGroupRoomsRent += roomCost;

      let gTuition = 0;
      for (const child of activeGroupChildren) {
        gTuition += calculateChildMonthlyTuition(
          child,
          tuition,
          discountLevels,
          yearlyDiscountPercent
        );
      }
      const fullMonthMeal = g.age ? mealMonthly(g.age, workingDays, mealBase, mealExtra) : 0;
      const gMealPerChild = Math.round(fullMonthMeal * attendanceRate);
      const gMeal = count * gMealPerChild;
      const gTotalIncome = gTuition + gMeal;
      const gExpenses = educator + assistant + roomCost;

      groupsTuitionIncome += gTuition;
      totalMealIncome += gMeal;

      return {
        groupId: g.id,
        groupName: g.name,
        age: g.age,
        childrenCount: count,
        tuitionIncome: toMoney(gTuition),
        mealIncome: toMoney(gMeal),
        totalIncome: toMoney(gTotalIncome),
        income: toMoney(gTotalIncome),
        expenses: toMoney(gExpenses),
        profit: toMoney(gTotalIncome - gExpenses),
      };
    });

    const totalTuitionIncome = groupsTuitionIncome;
    const totalIncome = totalTuitionIncome + totalMealIncome;

    let clubTeachersCount = DEFAULT_CLUB_TEACHERS_COUNT;
    let managersCount = DEFAULT_MANAGERS_COUNT;
    let educatorsCount = assignedActiveEducatorsCount;
    let assistantsCount = assignedActiveAssistantsCount;

    const staffCounts = await this.repository.countActiveStaffByType();
    if (staffCounts) {
      clubTeachersCount = staffCounts.CLUB_TEACHER ?? clubTeachersCount;
      managersCount = staffCounts.MANAGER ?? managersCount;
      educatorsCount = Math.max(
        assignedActiveEducatorsCount,
        staffCounts.EDUCATOR ?? educatorsCount
      );
      assistantsCount = Math.max(
        assignedActiveAssistantsCount,
        staffCounts.ASSISTANT ?? assistantsCount
      );
    }

    const freeAssistantsCount = Math.max(0, assistantsCount - assignedActiveAssistantsCount);
    if (freeAssistantsCount > 0) {
      totalAssistantsSalary += freeAssistantsCount * assistantBase;
    }

    const totalClubTeachersSalary = clubTeachersCount * clubTeacherSalary(clubSalary);
    const totalManagerSalary = managersCount * managerSalary(mgrSalary);
    const totalStaffSalaries =
      totalEducatorsSalary + totalAssistantsSalary + totalClubTeachersSalary + totalManagerSalary;

    const occupiedGroupRooms = groups.length;
    const occupiedClubRooms = Math.min(
      DEFAULT_CLUB_ROOMS_COUNT,
      Math.max(0, roomsCount - occupiedGroupRooms)
    );
    const occupiedRoomsCount = occupiedGroupRooms + occupiedClubRooms;
    const operatingRoomsRent = totalOccupiedGroupRoomsRent + occupiedClubRooms * defaultRoomCost;
    const totalRoomsRent = roomsCount * defaultRoomCost;
    const vacantRoomsCount = Math.max(0, roomsCount - occupiedRoomsCount);
    const idleRoomsRent = Math.max(0, totalRoomsRent - operatingRoomsRent);

    const totalExpenses = totalStaffSalaries + totalRoomsRent;
    const totalProfit = totalIncome - totalExpenses;
    const profitMoney = toMoney(totalProfit);

    const incomeBreakdown = {
      tuition: toMoney(totalTuitionIncome),
      meal: toMoney(totalMealIncome),
      total: toMoney(totalIncome),
    };

    const expensesBreakdown = {
      educatorsSalary: toMoney(totalEducatorsSalary),
      assistantsSalary: toMoney(totalAssistantsSalary),
      clubTeachersSalary: toMoney(totalClubTeachersSalary),
      managerSalary: toMoney(totalManagerSalary),
      staffSalaries: toMoney(totalStaffSalaries),
      roomsRent: toMoney(totalRoomsRent),
      operatingRoomsRent: toMoney(operatingRoomsRent),
      idleRoomsRent: toMoney(idleRoomsRent),
      total: toMoney(totalExpenses),
    };

    return {
      activeChildrenCount: totalAssignedChildrenCount,
      assignedChildrenCount: totalAssignedChildrenCount,
      groupsCount: groups.length,
      roomsCount,
      educatorsCount,
      assistantsCount,
      clubTeachersCount,
      managersCount,
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: profitMoney,
      netProfit: profitMoney,
      breakdown: {
        income: {
          tuition: toMoney(totalTuitionIncome),
          meal: toMoney(totalMealIncome),
          total: toMoney(totalIncome),
        },
        expenses: {
          educatorsSalary: toMoney(totalEducatorsSalary),
          assistantsSalary: toMoney(totalAssistantsSalary),
          clubTeachersSalary: toMoney(totalClubTeachersSalary),
          managerSalary: toMoney(totalManagerSalary),
          staffSalaries: toMoney(totalStaffSalaries),
          roomsRent: toMoney(totalRoomsRent),
          operatingRoomsRent: toMoney(operatingRoomsRent),
          idleRoomsRent: toMoney(idleRoomsRent),
          total: toMoney(totalExpenses),
        },
      },
      rooms: {
        total: roomsCount,
        occupied: occupiedRoomsCount,
        vacant: vacantRoomsCount,
        cost: {
          total: toMoney(totalRoomsRent),
          operating: toMoney(operatingRoomsRent),
          idle: toMoney(idleRoomsRent),
        },
      },
      groups: groupsBreakdown,
      calendar,
    };
  }

  /**
   * Розрахунок оптимальної економічної моделі дитячого садка під динамічний віковий попит:
   * - Оптимізує заповнення груп з урахуванням порогу 12 дітей (доплати вихователям і помічникам);
   * - Враховує вартість кожної задіяної кімнати (50 000 грн/міс);
   * - Враховує 5 окремих кабінетів для гуртків;
   * - Враховує 8-годинний робочий день викладачів гуртків (45 занять/тиждень, до 15 груп на 5 викладачів);
   * - Враховує диференційований дохід від харчування за віком (2 р. - 300 грн, 3 р. - 400 грн, 4 р. - 500 грн, 5 р. - 600 грн на день);
   * - Відсікає нерентабельні залишки дітей (waitlist), якщо вони створюють надлишкові витрати на відкриття кімнати;
   * - Повертає 3 секції:
   *   1. recommended: абсолютний фінансовий оптимум (скільки груп відкрити, кімнат зайняти, викладачів найняти, чистий прибуток);
   *   2. strategies: MAX_PROFIT, COMFORT_QUALITY, MINIMAL_INFRASTRUCTURE;
   *   3. marginalEconomics: аналіз меж (marginalChild, clubTeachersStatus, expansionAnalysis, roomsStatus, waitlistAdvice).
   *
   * @param {Object} demand
   */
  async calculateOptimalForecast(demand = {}) {
    const calendar = this.resolveCalendar(demand.month);
    const options = {
      tuition: this.settings.get('TUITION_MONTHLY'),
      ratePerChild: this.settings.get('EDUCATOR_PER_CHILD'),
      extraPay: this.settings.get('EDUCATOR_EXTRA_PAY'),
      assistantBase: this.settings.get('ASSISTANT_SALARY'),
      assistantExtra: this.settings.get('ASSISTANT_EXTRA_PAY'),
      threshold: demand.threshold ?? this.settings.get('GROUP_EXTRA_PAY_THRESHOLD'),
      clubSalary: this.settings.get('CLUB_TEACHER_SALARY'),
      mgrSalary: this.settings.get('MANAGER_SALARY'),
      roomCost: this.settings.get('ROOM_MONTHLY_COST'),
      totalRoomsCount: this.settings.get('DEFAULT_ROOMS_COUNT'),
      maxChildrenInGroup: this.settings.get('MAX_CHILDREN_IN_GROUP'),
      mealBasePerDay: this.settings.get('MEAL_BASE_PER_DAY'),
      mealPerExtraYear: this.settings.get('MEAL_PER_EXTRA_YEAR'),
      attendanceRate: demand.attendanceRate ?? this.settings.get('ATTENDANCE_RATE_PERCENT') / 100,
      // Харчування — за робочими днями місяця прогнозу (Пн–Пт мінус свята), а не за сталими 21
      workingDays: calendar.workingDays,
    };

    const rawResult = optimizeKindergartenCapacity(demand, options);
    return { ...formatOptimalForecastMoney(rawResult), calendar };
  }

  /**
   * Формує прогноз розкладу занять гуртків на тиждень для запланованих груп.
   * Перевіряє математичну та часову здійсненність (feasibility) розкладу,
   * розраховує слоти, завантаженість викладачів та відсутність конфліктів у кабінетах.
   */
  async calculateForecastSchedule(demand = {}) {
    const forecast = await this.calculateOptimalForecast(demand);
    const strategyKey = demand.strategy || 'recommended';

    let chosenConfig = forecast.recommended;
    if (strategyKey !== 'recommended') {
      if (forecast.strategies?.[strategyKey]) {
        chosenConfig = forecast.strategies[strategyKey];
      } else {
        const match = Object.values(forecast.strategies || {}).find(
          (s) =>
            s.strategyCode?.toLowerCase() === strategyKey.toLowerCase() ||
            s.strategyCode === strategyKey
        );
        chosenConfig = match || forecast.recommended;
      }
    }

    const totalGroups = chosenConfig?.groupsCount ?? chosenConfig?.totalGroups ?? 0;
    const calendar = forecast.calendar;

    if (totalGroups === 0) {
      return {
        feasible: true,
        strategy: strategyKey,
        groupsCount: 0,
        childrenCount: 0,
        clubsCount: 0,
        maxFeasibleGroups: 0,
        groups: [],
        slots: [],
        summary: {
          totalSlots: 0,
          lessonSlots: 0,
          walkSlots: 0,
          mealSlots: 0,
          teacherWorkload: {
            lessonsPerWeekPerTeacher: 0,
            maxCapacityPerTeacher: TEACHER_WEEKLY_CAPACITY,
            utilizationRatePercent: 0,
          },
        },
        calendar,
        conflicts: [],
      };
    }

    let dbClubs = [];
    try {
      if (typeof this.repository.findClubs === 'function') {
        dbClubs = (await this.repository.findClubs()) || [];
      }
    } catch {
      dbClubs = [];
    }
    const clubs = dbClubs && dbClubs.length > 0 ? dbClubs : DEFAULT_CLUBS;
    const clubsCount = clubs.length;
    const maxFeasible = maxGroupsFor(clubsCount);

    const groups = [];
    let groupIdCounter = 1;
    let totalChildren = 0;

    if (chosenConfig?.ageBreakdown) {
      for (let age = 2; age <= 5; age += 1) {
        const ageData = chosenConfig.ageBreakdown[age];
        const sizes = ageData?.groupSizes || [];
        for (const size of sizes) {
          groups.push({
            id: groupIdCounter,
            name: `Група ${groupIdCounter} (${age} р.)`,
            age,
            childrenCount: size,
          });
          totalChildren += size;
          groupIdCounter += 1;
        }
      }
    }

    while (groups.length < totalGroups) {
      groups.push({
        id: groupIdCounter,
        name: `Група ${groupIdCounter}`,
        age: null,
        childrenCount: 0,
      });
      groupIdCounter += 1;
    }

    let slots = [];
    let conflicts = [];
    let feasible;
    let failureReason = null;

    try {
      slots = this.scheduleGenerator({ groups, clubs });
      conflicts = validateSchedule(slots);
      feasible = conflicts.length === 0;
    } catch (err) {
      if (err instanceof ScheduleCapacityError) {
        feasible = false;
        failureReason = err.message;
      } else {
        throw err;
      }
    }

    const lessonSlots = slots.filter((s) => s.activity === ACTIVITY.CLUB).length;
    const walkSlots = slots.filter((s) => s.activity === ACTIVITY.WALK).length;
    const mealSlots = slots.filter((s) => s.activity === ACTIVITY.MEAL).length;

    const lessonsPerTeacher = clubsCount > 0 ? lessonSlots / clubsCount : 0;
    const utilization =
      TEACHER_WEEKLY_CAPACITY > 0
        ? Math.round((lessonsPerTeacher / TEACHER_WEEKLY_CAPACITY) * 1000) / 10
        : 0;

    const clubsMap = new Map(clubs.map((c) => [c.id, c.name]));
    const enrichedSlots = slots.map((s) => ({
      ...s,
      clubName: s.clubId ? clubsMap.get(s.clubId) ?? null : null,
    }));

    return {
      feasible,
      ...(failureReason ? { failureReason } : {}),
      strategy: strategyKey,
      groupsCount: groups.length,
      childrenCount: totalChildren || (chosenConfig?.totalAdmitted ?? 0),
      clubsCount,
      maxFeasibleGroups: maxFeasible,
      groups,
      slots: enrichedSlots,
      summary: {
        totalSlots: slots.length,
        lessonSlots,
        walkSlots,
        mealSlots,
        teacherWorkload: {
          lessonsPerWeekPerTeacher: lessonsPerTeacher,
          maxCapacityPerTeacher: TEACHER_WEEKLY_CAPACITY,
          utilizationRatePercent: utilization,
        },
      },
      calendar,
      conflicts,
    };
  }
}

function formatVariantFinancials(cfg) {
  if (!cfg) return null;
  const financials = {
    tuitionIncome: toMoney(cfg.tuitionIncome),
    mealIncome: toMoney(cfg.mealIncome),
    totalIncome: toMoney(cfg.totalIncome),
    expenses: {
      roomsRent: toMoney(cfg.totalRoomsRent),
      assistantsSalary: toMoney(cfg.totalAssistantsSalary),
      educatorsSalary: toMoney(cfg.totalEducatorsSalary),
      clubTeachersSalary: toMoney(cfg.totalClubTeachersSalary),
      managerSalary: toMoney(cfg.totalManagerSalary),
      totalStaffSalaries: toMoney(cfg.totalStaffSalaries),
      totalExpenses: toMoney(cfg.totalExpenses),
    },
    netProfit: toMoney(cfg.netProfit),
  };

  const formattedAgeBreakdown = {};
  if (cfg.ageBreakdown) {
    for (const [ageKey, ageData] of Object.entries(cfg.ageBreakdown)) {
      formattedAgeBreakdown[ageKey] = {
        age: ageData.age,
        demanded: ageData.demanded,
        admitted: ageData.admitted,
        rejected: ageData.rejected,
        groupsCount: ageData.groupsCount,
        groupSizes: ageData.groupSizes,
        tuitionIncome: toMoney(ageData.tuitionIncome),
        mealIncome: toMoney(ageData.mealIncome),
        totalIncome: toMoney(ageData.totalIncome),
        educatorsSalary: toMoney(ageData.educatorsSalary),
        assistantsSalary: toMoney(ageData.assistantsSalary),
      };
    }
  }

  return {
    ...cfg,
    groupsCount: cfg.totalGroups,
    netProfit: toMoney(cfg.netProfit),
    profitDifference:
      cfg.profitDifference !== undefined ? toMoney(cfg.profitDifference) : undefined,
    financials,
    ageBreakdown: formattedAgeBreakdown,
  };
}

function formatOptimalForecastMoney(rawResult) {
  const recommended = rawResult.recommended ? formatVariantFinancials(rawResult.recommended) : null;

  const topVariants = (rawResult.topVariants || []).map((v) => formatVariantFinancials(v));

  const strategies = {};
  if (rawResult.strategies) {
    for (const [code, strat] of Object.entries(rawResult.strategies)) {
      strategies[code] = formatVariantFinancials(strat);
    }
  }

  const waitlistAdvice = (rawResult.marginalEconomics?.waitlistAdvice || []).map((advice) => ({
    ...advice,
    barrierCost: advice.barrierCost !== undefined ? toMoney(advice.barrierCost) : undefined,
  }));

  const rawMarginal = rawResult.marginalEconomics || {};

  const marginalChild = rawMarginal.marginalChild
    ? {
        ...rawMarginal.marginalChild,
        marginalIncome: toMoney(rawMarginal.marginalChild.marginalIncome),
        marginalCost: toMoney(rawMarginal.marginalChild.marginalCost),
        marginalProfit: toMoney(rawMarginal.marginalChild.marginalProfit),
      }
    : null;

  const expansionAnalysis = rawMarginal.expansionAnalysis
    ? {
        ...rawMarginal.expansionAnalysis,
        costJump: toMoney(rawMarginal.expansionAnalysis.costJump),
        breakdown: {
          roomCost: toMoney(rawMarginal.expansionAnalysis.breakdown.roomCost),
          assistantBase: toMoney(rawMarginal.expansionAnalysis.breakdown.assistantBase),
          clubTeachersCost: toMoney(rawMarginal.expansionAnalysis.breakdown.clubTeachersCost),
        },
      }
    : null;

  return {
    requestedDemand: rawResult.requestedDemand,
    recommended,
    strategies,
    marginalEconomics: {
      marginalChild,
      clubTeachersStatus: rawMarginal.clubTeachersStatus,
      expansionAnalysis,
      roomsStatus: rawMarginal.roomsStatus,
      waitlistAdvice,
    },
    topVariants,
  };
}

const analyticsService = new AnalyticsService();

module.exports = {
  AnalyticsService,
  analyticsService,
  toMoney,
  formatVariantFinancials,
  formatOptimalForecastMoney,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  DEFAULT_TOTAL_ROOMS_COUNT,
  DEFAULT_CLUBS,
  TEACHER_WEEKLY_CAPACITY,
};
