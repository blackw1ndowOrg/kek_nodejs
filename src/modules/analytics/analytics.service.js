const { NotFoundError, BadRequestError } = require('../../errors/AppError');
const {
  groupMonthlyProfit,
  sharedMonthlyCosts,
  sumGroupProfits,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
} = require('../../domain/profit');
const { optimizeKindergartenCapacity, resolveWorkingDays } = require('../../domain/forecast');
const { currentMonth, monthSequence, workingDaysInMonth } = require('../../domain/calendar');
const { MIN_AGE, MAX_AGE } = require('../../domain/pricing');
const { toMoney } = require('../../domain/money');
const { settingsService } = require('../settings/settings.service');
const { analyticsRepository } = require('./analytics.repository');

const DEFAULT_TOTAL_ROOMS_COUNT = 20;
const DEFAULT_FORECAST_MONTHS = 12;

/** Вікові рядки прогнозу: 2, 3, 4, 5 років */
const FORECAST_AGES = Object.freeze(
  Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i)
);

/** Припущення прогнозу по місяцях, доки BA не вирішить інакше */
const FORECAST_ASSUMPTIONS = Object.freeze([
  'Склад груп і вік дітей — як зараз: перехід дітей у старші групи 1 вересня не моделюється',
  'Літньої перерви немає: садок працює всі місяці',
  'Спільні витрати (гуртки, менеджер, помічники без групи, простій кімнат) між віками не діляться',
  'Навчання й зарплати однакові щомісяця; змінюється лише харчування — за робочими днями місяця',
]);

/**
 * Припущення прогнозу: базові + рядок про роки періоду, для яких у HOLIDAYS немає жодного свята
 * (список свят ведуть на рік-два вперед, тож далі календар рахує лише Пн–Пт)
 */
function forecastAssumptions(months, holidays) {
  const knownYears = new Set(holidays.map((date) => date.slice(0, 4)));
  const missingYears = [...new Set(months.map((month) => month.slice(0, 4)))].filter(
    (year) => !knownYears.has(year)
  );
  if (missingYears.length === 0) return FORECAST_ASSUMPTIONS;
  const label = missingYears.length === 1 ? 'рік' : 'роки';
  return [
    ...FORECAST_ASSUMPTIONS,
    `Свят на ${missingYears.join(', ')} ${label} у налаштуваннях немає: робочі дні — лише Пн–Пт`,
  ];
}

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
    now = () => new Date()
  ) {
    this.repository = repository;
    this.settings = settings;
    this.now = now;
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

  /** Ставки з налаштувань для формул профіту (src/domain/profit.js) */
  rates() {
    return {
      tuition: this.settings.get('TUITION_MONTHLY'),
      discountLevels: this.settings.get('DISCOUNT_LEVELS'),
      yearlyDiscountPercent: this.settings.get('YEARLY_DISCOUNT_PERCENT') ?? 12,
      educatorPerChild: this.settings.get('EDUCATOR_PER_CHILD'),
      educatorExtraPay: this.settings.get('EDUCATOR_EXTRA_PAY'),
      assistantSalary: this.settings.get('ASSISTANT_SALARY'),
      assistantExtraPay: this.settings.get('ASSISTANT_EXTRA_PAY'),
      threshold: this.settings.get('GROUP_EXTRA_PAY_THRESHOLD'),
      clubTeacherSalary: this.settings.get('CLUB_TEACHER_SALARY'),
      managerSalary: this.settings.get('MANAGER_SALARY'),
      roomMonthlyCost: this.settings.get('ROOM_MONTHLY_COST'),
      roomsCount: this.settings.get('DEFAULT_ROOMS_COUNT'),
      mealBasePerDay: this.settings.get('MEAL_BASE_PER_DAY'),
      mealPerExtraYear: this.settings.get('MEAL_PER_EXTRA_YEAR'),
    };
  }

  /** Група з бази -> вхід groupMonthlyProfit */
  toProfitInput(group, rates) {
    const children = group.children || [];
    return {
      age: group.age,
      children,
      childrenCount: group._count?.children ?? children.length,
      hasEducator: isStaffActive(group.educator, group.educatorId),
      hasAssistant: isStaffActive(group.assistant, group.assistantId),
      roomRent: group.room ? group.room.monthlyCost : rates.roomMonthlyCost,
    };
  }

  /**
   * Профіти всіх груп і спільні витрати садка за місяць (у копійках).
   * Одна основа для GET /profit і POST /forecast/calendar.
   */
  async loadKindergarten(rates) {
    const groups = await this.repository.findAllGroupsWithActiveChildren();
    const staffCounts = await this.repository.countActiveStaffByType();
    const inputs = groups.map((group) => this.toProfitInput(group, rates));
    const shared = sharedMonthlyCosts(
      {
        groupsCount: groups.length,
        groupRoomsRent: inputs.reduce((sum, input) => sum + input.roomRent, 0),
        assignedEducators: inputs.filter((input) => input.hasEducator).length,
        assignedAssistants: inputs.filter((input) => input.hasAssistant).length,
        staffCounts,
      },
      rates
    );
    return { groups, inputs, shared };
  }

  /**
   * Розрахунок профіту окремої групи:
   * - Дохід: сума щомісячної оплати за навчання та харчування за віком групи для всіх активних дітей
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

    const rates = this.rates();
    const result = groupMonthlyProfit(this.toProfitInput(group, rates), rates, {
      workingDays: this.settings.get('WORKING_DAYS_PER_MONTH'),
      attendanceRate: this.resolveAttendanceRate(query),
    });

    const incomeBreakdown = {
      tuition: toMoney(result.tuition),
      meal: toMoney(result.meal),
      total: toMoney(result.income),
    };

    const expensesBreakdown = {
      educatorSalary: toMoney(result.educatorSalary),
      assistantSalary: toMoney(result.assistantSalary),
      roomRent: toMoney(result.roomRent),
      total: toMoney(result.expenses),
    };

    return {
      groupId: group.id,
      groupName: group.name,
      age: group.age,
      childrenCount: result.childrenCount,
      room: {
        id: group.room ? group.room.id : group.roomId,
        name: group.room ? group.room.name : null,
        cost: toMoney(result.roomRent),
      },
      tuitionIncome: toMoney(result.tuition),
      mealIncome: toMoney(result.meal),
      totalIncome: toMoney(result.income),
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: toMoney(result.profit),
      breakdown: {
        income: incomeBreakdown,
        expenses: expensesBreakdown,
      },
    };
  }

  /**
   * Розрахунок загального профіту всього садка:
   * - Доходи: сума навчання та харчування дітей, зарахованих до груп
   * - Витрати: витрати груп (вихователі, помічники, кімнати груп) + спільні витрати
   *   (викладачі гуртків, менеджер, помічники без групи, кабінети гуртків і простій кімнат)
   * - Чистий профіт = сума профітів груп − спільні витрати
   *
   * @param {Object} [query={}]
   */
  async getTotalProfit(query = {}) {
    const rates = this.rates();
    const period = {
      workingDays: this.settings.get('WORKING_DAYS_PER_MONTH'),
      attendanceRate: this.resolveAttendanceRate(query),
    };
    const { groups, inputs, shared } = await this.loadKindergarten(rates);
    const results = inputs.map((input) => groupMonthlyProfit(input, rates, period));
    const sum = sumGroupProfits(results);

    const assistantsSalary = sum.assistantSalary + shared.unassignedAssistantsSalary;
    const staffSalaries =
      sum.educatorSalary + assistantsSalary + shared.clubTeachersSalary + shared.managerSalary;
    const roomsRent = shared.operatingRoomsRent + shared.idleRoomsRent;
    const totalExpenses = sum.expenses + shared.total;
    const totalProfit = sum.profit - shared.total;
    const profitMoney = toMoney(totalProfit);

    const incomeBreakdown = {
      tuition: toMoney(sum.tuition),
      meal: toMoney(sum.meal),
      total: toMoney(sum.income),
    };

    const expensesBreakdown = {
      educatorsSalary: toMoney(sum.educatorSalary),
      assistantsSalary: toMoney(assistantsSalary),
      clubTeachersSalary: toMoney(shared.clubTeachersSalary),
      managerSalary: toMoney(shared.managerSalary),
      staffSalaries: toMoney(staffSalaries),
      roomsRent: toMoney(roomsRent),
      operatingRoomsRent: toMoney(shared.operatingRoomsRent),
      idleRoomsRent: toMoney(shared.idleRoomsRent),
      total: toMoney(totalExpenses),
    };

    const groupsBreakdown = groups.map((g, index) => {
      const result = results[index];
      return {
        groupId: g.id,
        groupName: g.name,
        age: g.age,
        childrenCount: result.childrenCount,
        tuitionIncome: toMoney(result.tuition),
        mealIncome: toMoney(result.meal),
        totalIncome: toMoney(result.income),
        income: toMoney(result.income),
        expenses: toMoney(result.expenses),
        profit: toMoney(result.profit),
      };
    });

    return {
      activeChildrenCount: sum.childrenCount,
      assignedChildrenCount: sum.childrenCount,
      groupsCount: groups.length,
      roomsCount: rates.roomsCount,
      educatorsCount: shared.educatorsCount,
      assistantsCount: shared.assistantsCount,
      clubTeachersCount: shared.clubTeachersCount,
      managersCount: shared.managersCount,
      income: incomeBreakdown,
      expenses: expensesBreakdown,
      profit: profitMoney,
      netProfit: profitMoney,
      breakdown: {
        income: { ...incomeBreakdown },
        expenses: { ...expensesBreakdown },
      },
      rooms: {
        total: rates.roomsCount,
        occupied: groups.length + shared.clubRooms,
        vacant: shared.vacantRooms,
        cost: {
          total: toMoney(roomsRent),
          operating: toMoney(shared.operatingRoomsRent),
          idle: toMoney(shared.idleRoomsRent),
        },
      },
      groups: groupsBreakdown,
    };
  }

  /**
   * Прогноз профіту по місяцях у розрізі віку (2–5 років).
   *
   * Для кожного місяця з from (за замовчуванням поточний за Києвом) на months місяців:
   * - рядок для кожного віку: сума groupMonthlyProfit усіх груп цього віку
   *   (та сама формула, що й GET /groups/:id/profit), харчування — за робочими днями місяця;
   * - спільні витрати (гуртки, менеджер, помічники без групи, простій кімнат) — не діляться між віками;
   * - підсумок садка: сума профітів віків − спільні витрати.
   *
   * Припущення до рішення BA: склад груп і вік дітей — як зараз (без переходу 1 вересня),
   * без літньої перерви; спільні витрати між віками не діляться.
   *
   * @param {{ from?: string, months?: number, attendanceRate?: number }} [params={}]
   */
  async getCalendarForecast({ from, months = DEFAULT_FORECAST_MONTHS, attendanceRate } = {}) {
    const rates = this.rates();
    const rate = this.resolveAttendanceRate({ attendanceRate });
    const holidays = this.settings.get('HOLIDAYS');
    const sequence = monthSequence(from ?? currentMonth(this.now()), months);
    const { groups, inputs, shared } = await this.loadKindergarten(rates);

    const sharedMoney = {
      clubTeachersSalary: toMoney(shared.clubTeachersSalary),
      clubRoomsRent: toMoney(shared.clubRoomsRent),
      managerSalary: toMoney(shared.managerSalary),
      unassignedAssistantsSalary: toMoney(shared.unassignedAssistantsSalary),
      idleRoomsRent: toMoney(shared.idleRoomsRent),
      total: toMoney(shared.total),
    };

    let periodIncome = 0;
    let periodExpenses = 0;
    let periodProfit = 0;

    const monthsReport = sequence.map((month) => {
      const workingDays = workingDaysInMonth(month, holidays);
      const period = { workingDays, attendanceRate: rate };
      const results = inputs.map((input) => groupMonthlyProfit(input, rates, period));

      const ages = FORECAST_AGES.map((age) => {
        const row = sumGroupProfits(results.filter((_, index) => groups[index].age === age));
        return {
          age,
          groupsCount: row.groupsCount,
          childrenCount: row.childrenCount,
          tuition: toMoney(row.tuition),
          meal: toMoney(row.meal),
          income: toMoney(row.income),
          educatorSalary: toMoney(row.educatorSalary),
          assistantSalary: toMoney(row.assistantSalary),
          roomsRent: toMoney(row.roomRent),
          expenses: toMoney(row.expenses),
          profit: toMoney(row.profit),
        };
      });

      const all = sumGroupProfits(results);
      const expenses = all.expenses + shared.total;
      const profit = all.profit - shared.total;
      periodIncome += all.income;
      periodExpenses += expenses;
      periodProfit += profit;

      return {
        month,
        workingDays,
        ages,
        shared: sharedMoney,
        total: {
          childrenCount: all.childrenCount,
          income: toMoney(all.income),
          expenses: toMoney(expenses),
          profit: toMoney(profit),
        },
      };
    });

    return {
      from: sequence[0],
      to: sequence[sequence.length - 1],
      monthsCount: sequence.length,
      attendanceRate: rate,
      assumptions: forecastAssumptions(sequence, holidays),
      months: monthsReport,
      summary: {
        income: toMoney(periodIncome),
        expenses: toMoney(periodExpenses),
        profit: toMoney(periodProfit),
      },
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
      month: demand.month ?? currentMonth(this.now()),
      holidays: this.settings.get('HOLIDAYS'),
    };

    const rawResult = optimizeKindergartenCapacity(demand, options);
    return {
      ...formatOptimalForecastMoney(rawResult),
      calendar: { month: options.month, workingDays: resolveWorkingDays(options) },
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
  DEFAULT_FORECAST_MONTHS,
  FORECAST_AGES,
  FORECAST_ASSUMPTIONS,
};
