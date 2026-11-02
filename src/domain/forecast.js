const { BadRequestError } = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');
const { tuitionMonthly, mealMonthly } = require('./pricing');
const { educatorSalary, assistantSalary, clubTeacherSalary, managerSalary } = require('./salary');

const MAX_KINDERGARTEN_CAPACITY = 300;
const MAX_CHILDREN_PER_GROUP = 20;
const DEFAULT_TOTAL_ROOMS = 20;
const DEFAULT_CLUB_ROOMS = 5;
const DEFAULT_GROUP_ROOMS = DEFAULT_TOTAL_ROOMS - DEFAULT_CLUB_ROOMS; // 15
const MAX_GROUP_ROOMS = DEFAULT_GROUP_ROOMS;
const DEFAULT_CLUB_TEACHERS = 5;
const DEFAULT_MANAGERS = 1;
const DEFAULT_EXTRA_PAY_THRESHOLD = 12;

// Константи навчального розкладу гуртків
const CLUB_SUBJECTS_COUNT = 5;
const LESSONS_PER_WEEK_PER_GROUP = 3;
const TEACHER_WORK_HOURS_PER_DAY = 8;
const WORK_DAYS_PER_WEEK = 5;
const TEACHER_WEEKLY_CAPACITY = TEACHER_WORK_HOURS_PER_DAY * WORK_DAYS_PER_WEEK; // 40 занять на тиждень
const MAX_GROUPS_PER_TEACHER = Math.floor(TEACHER_WEEKLY_CAPACITY / LESSONS_PER_WEEK_PER_GROUP); // 13 груп
const DEFAULT_WORKING_DAYS = 21;
const DEFAULT_ATTENDANCE_RATE = 0.8; // Коефіцієнт фактичної відвідуваності з урахуванням хвороб дітей (80%)

/**
 * Валідує параметри конфігурації (options).
 *
 * @param {Object} options
 */
function validateOptions(options = {}) {
  const threshold = options.threshold ?? DEFAULT_EXTRA_PAY_THRESHOLD;
  const maxChildrenInGroup =
    options.maxChildrenInGroup ?? options.maxGroupSize ?? MAX_CHILDREN_PER_GROUP;
  const totalRoomsCount = options.totalRoomsCount ?? options.roomsCount ?? DEFAULT_TOTAL_ROOMS;
  const clubRoomsCount = options.clubRoomsCount ?? DEFAULT_CLUB_ROOMS;
  const workingDays = options.workingDays ?? DEFAULT_WORKING_DAYS;
  const attendanceRate = options.attendanceRate ?? DEFAULT_ATTENDANCE_RATE;

  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new BadRequestError(
      `threshold must be a non-negative integer: ${threshold}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (!Number.isInteger(maxChildrenInGroup) || maxChildrenInGroup <= 0) {
    throw new BadRequestError(
      `maxChildrenInGroup must be a positive integer: ${maxChildrenInGroup}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (threshold > maxChildrenInGroup) {
    throw new BadRequestError(
      `threshold (${threshold}) cannot exceed maxChildrenInGroup (${maxChildrenInGroup})`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (!Number.isInteger(totalRoomsCount) || totalRoomsCount < 0) {
    throw new BadRequestError(
      `totalRoomsCount must be a non-negative integer: ${totalRoomsCount}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (!Number.isInteger(clubRoomsCount) || clubRoomsCount < 0) {
    throw new BadRequestError(
      `clubRoomsCount must be a non-negative integer: ${clubRoomsCount}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (!Number.isInteger(workingDays) || workingDays < 0) {
    throw new BadRequestError(
      `workingDays must be a non-negative integer: ${workingDays}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (typeof attendanceRate !== 'number' || attendanceRate <= 0 || attendanceRate > 1) {
    throw new BadRequestError(
      `attendanceRate must be a number between 0 and 1: ${attendanceRate}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
}

/**
 * Перевіряє коректність бажаної кількості дітей:
 * - ціле число;
 * - невід'ємне (>= 0);
 * - не перевищує максимальну місткість садка (<= 300).
 *
 * @param {number} childrenCount
 * @param {number} maxCapacity
 */
function assertTargetChildrenCount(childrenCount, maxCapacity = MAX_KINDERGARTEN_CAPACITY) {
  if (!Number.isInteger(childrenCount) || childrenCount < 0) {
    throw new BadRequestError(
      `Target children count must be a non-negative integer: ${childrenCount}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (childrenCount > maxCapacity) {
    throw new BadRequestError(
      `Target children count cannot exceed maximum capacity of ${maxCapacity} children: ${childrenCount}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
}

/**
 * Оптимально розподіляє дітей між заданою кількістю груп g.
 * - Якщо дітей <= g * threshold: рівномірний розподіл гарантує, що жодна група
 *   не перевищить поріг threshold (0 грн доплат extraPay).
 * - Якщо дітей > g * threshold: асиметричний розподіл фіксує якомога більше груп
 *   на рівні threshold, а надлишок дітей концентрує у мінімальній кількості груп (до capPerGroup).
 *   Це мінімізує кількість груп із доплатами extraPay.
 *
 * @param {number} admitted кількість прийнятих дітей
 * @param {number} g кількість відкритих груп
 * @param {number} [threshold=12] поріг нарахування доплати
 * @param {number} [capPerGroup=20] місткість однієї групи
 * @returns {number[]} масив розмірів кожної групи
 */
function distributeChildrenOptimally(
  admitted,
  g,
  threshold = DEFAULT_EXTRA_PAY_THRESHOLD,
  capPerGroup = MAX_CHILDREN_PER_GROUP
) {
  if (!Number.isInteger(admitted) || admitted < 0) {
    throw new BadRequestError(
      `Admitted children must be a non-negative integer: ${admitted}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (!Number.isInteger(g) || g < 0) {
    throw new BadRequestError(
      `Groups count must be a non-negative integer: ${g}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (g === 0 || admitted === 0) {
    return [];
  }

  // Якщо дітей менше або дорівнює g * threshold:
  // Рівномірний розподіл гарантує, що max(groupSize) <= threshold (нуль перевантажень).
  if (admitted <= g * threshold) {
    const q = Math.floor(admitted / g);
    const r = admitted % g;
    return Array(r)
      .fill(q + 1)
      .concat(Array(g - r).fill(q));
  }

  // Якщо дітей більше за g * threshold:
  // Асиметричний розподіл: стартуємо всі g груп із threshold дітей,
  // а залишок (excess) жадібно пакуємо в мінімальну кількість груп до capPerGroup.
  const excess = admitted - g * threshold;
  const sizes = Array(g).fill(threshold);
  let rem = excess;
  for (let i = 0; i < g && rem > 0; i += 1) {
    const add = Math.min(rem, capPerGroup - threshold);
    sizes[i] += add;
    rem -= add;
  }
  return sizes;
}

/**
 * Розподіляє цільову кількість дітей по групах за оптимальною стратегією.
 *
 * @param {number} childrenCount
 * @param {number} [maxGroupSize=20]
 * @param {number} [maxCapacity=300]
 * @param {number} [threshold=12]
 * @returns {number[]} масив з кількістю дітей у кожній групі
 */
function distributeChildrenIntoGroups(
  childrenCount,
  maxGroupSize = MAX_CHILDREN_PER_GROUP,
  maxCapacity = MAX_KINDERGARTEN_CAPACITY,
  threshold = DEFAULT_EXTRA_PAY_THRESHOLD
) {
  assertTargetChildrenCount(childrenCount, maxCapacity);
  if (childrenCount === 0) {
    return [];
  }
  const groupsCount = Math.ceil(childrenCount / maxGroupSize);
  return distributeChildrenOptimally(childrenCount, groupsCount, threshold, maxGroupSize);
}

/**
 * Розраховує необхідну кількість викладачів гуртків:
 * 1 викладач гуртка проводить до 8 занять на день (40 занять/тиждень).
 * Кожна група потребує 3 занять на тиждень кожного з 5 предметів.
 * Відтак 1 комплект із 5 викладачів (по 1 на предмет) покриває до 13 груп включно.
 *
 * @param {number} groupsCount
 * @returns {number}
 */
function calculateClubTeachersCount(groupsCount) {
  if (!Number.isInteger(groupsCount) || groupsCount < 0) {
    throw new BadRequestError(
      `Groups count must be a non-negative integer: ${groupsCount}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (groupsCount === 0) return 0;
  const sets = Math.ceil(groupsCount / MAX_GROUPS_PER_TEACHER);
  return sets * CLUB_SUBJECTS_COUNT;
}

/**
 * Валідує та нормалізує попит за віковими категоріями (2, 3, 4, 5 років).
 * Приймає об'єкти типу: { 2: 25, 3: 45, 4: 18, 5: 14 } або { age2: 25, ... }
 *
 * @param {Object} rawDemand
 * @returns {{ 2: number, 3: number, 4: number, 5: number }}
 */
function normalizeAgeDemand(rawDemand = {}) {
  if (!rawDemand || typeof rawDemand !== 'object' || Array.isArray(rawDemand)) {
    throw new BadRequestError(
      'Demand must be an object with age keys (2, 3, 4, 5)',
      ErrorCodes.VALIDATION_ERROR
    );
  }

  if (rawDemand.targetChildrenCount !== undefined) {
    const total = Number(rawDemand.targetChildrenCount);
    if (!Number.isInteger(total) || total < 0) {
      throw new BadRequestError(
        `Target children count must be a non-negative integer: ${rawDemand.targetChildrenCount}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (total > MAX_KINDERGARTEN_CAPACITY) {
      throw new BadRequestError(
        `Target children count cannot exceed maximum capacity of ${MAX_KINDERGARTEN_CAPACITY} children: ${total}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const hasAges = [2, 3, 4, 5].some(
      (a) =>
        rawDemand[a] !== undefined ||
        rawDemand[`age${a}`] !== undefined ||
        rawDemand[`age_${a}`] !== undefined
    );
    if (!hasAges && !rawDemand.demand && !rawDemand.ageGroups) {
      const q = Math.floor(total / 4);
      const r = total % 4;
      return {
        2: q + (r > 0 ? 1 : 0),
        3: q + (r > 1 ? 1 : 0),
        4: q + (r > 2 ? 1 : 0),
        5: q,
      };
    }
  }

  const source =
    rawDemand.demand && typeof rawDemand.demand === 'object' && !Array.isArray(rawDemand.demand)
      ? rawDemand.demand
      : rawDemand.ageGroups &&
          typeof rawDemand.ageGroups === 'object' &&
          !Array.isArray(rawDemand.ageGroups)
        ? rawDemand.ageGroups
        : rawDemand;

  const normalized = {};
  for (let age = 2; age <= 5; age += 1) {
    const rawVal = source[age] ?? source[`age${age}`] ?? source[`age_${age}`] ?? 0;

    if (typeof rawVal === 'boolean' || Array.isArray(rawVal)) {
      throw new BadRequestError(
        `Demand for age ${age} must be an integer: ${rawVal}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (typeof rawVal === 'string' && rawVal.trim() === '') {
      throw new BadRequestError(
        `Demand for age ${age} cannot be empty string`,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const num = Number(rawVal);
    if (!Number.isInteger(num) || num < 0) {
      throw new BadRequestError(
        `Demand for age ${age} must be a non-negative integer: ${rawVal}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (num > 10000) {
      throw new BadRequestError(
        `Demand for age ${age} cannot exceed 10000: ${rawVal}`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    normalized[age] = num;
  }
  return normalized;
}

/**
 * Оцінює одну конфігурацію кількості груп за віковими категоріями.
 *
 * @param {Object} gVec вектор кількості груп { 2: g2, 3: g3, 4: g4, 5: g5 }
 * @param {Object} demand нормалізований попит
 * @param {Object} [options={}] параметри вартостей та налаштувань
 * @param {'standard'|'comfort'} [mode='standard']
 */
function evaluateConfiguration(gVec, demand, options = {}, mode = 'standard') {
  validateOptions(options);

  const {
    tuition = 1500000,
    ratePerChild = 200000,
    extraPay = 300000,
    assistantBase = 2000000,
    threshold = DEFAULT_EXTRA_PAY_THRESHOLD,
    clubSalary = 4000000,
    mgrSalary = 8000000,
    roomCost = 5000000,
    totalRoomsCount = options.roomsCount ?? DEFAULT_TOTAL_ROOMS,
    clubRoomsCount = DEFAULT_CLUB_ROOMS,
    maxChildrenInGroup = options.maxGroupSize ?? MAX_CHILDREN_PER_GROUP,
    mealBasePerDay = 30000,
    mealPerExtraYear = 10000,
    workingDays = DEFAULT_WORKING_DAYS,
    managersCount = DEFAULT_MANAGERS,
    attendanceRate = DEFAULT_ATTENDANCE_RATE,
  } = options;

  let totalTuitionIncome = 0;
  let totalMealIncome = 0;
  let totalEducatorsSalary = 0;
  let totalAssistantsSalary = 0;
  const ageBreakdown = {};
  const groupsList = [];

  const baseTuition = tuitionMonthly(0, tuition);

  for (let age = 2; age <= 5; age += 1) {
    const g = gVec[age] || 0;
    const d = demand[age] || 0;
    const capPerGroup = mode === 'comfort' ? threshold : maxChildrenInGroup;
    const maxCapacity = g * capPerGroup;

    let admitted = g === 0 ? 0 : Math.min(d, maxCapacity);

    // Дохід від харчування за 1 дитину з урахуванням факту хвороби (коефіцієнт фактичної відвідуваності) (Issue 3.4)
    const fullMonthMeal = mealMonthly(age, workingDays, mealBasePerDay, mealPerExtraYear);
    const mealPrice = Math.round(fullMonthMeal * attendanceRate);

    // Захист від збиткового набору понад threshold у режимі standard (Issue 2.5):
    // Якщо приріст витрат на extraPay вихователю й асистенту перевищує маржинальний прибуток від додаткових дітей,
    // зупиняємо набір на рівні g * threshold.
    if (mode === 'standard' && g > 0 && admitted > g * threshold) {
      const excessChildren = admitted - g * threshold;
      const overloadedGroups = Math.ceil(excessChildren / (capPerGroup - threshold));
      const marginalExtraCost = overloadedGroups * (2 * extraPay);
      const marginalChildProfit = baseTuition + mealPrice - ratePerChild;
      const marginalRevenue = excessChildren * marginalChildProfit;

      if (marginalRevenue < marginalExtraCost) {
        admitted = g * threshold;
      }
    }

    const rejected = d - admitted;
    const groupSizes = distributeChildrenOptimally(admitted, g, threshold, capPerGroup);

    const ageTuition = admitted * baseTuition;
    const ageMealIncome = admitted * mealPrice;

    totalTuitionIncome += ageTuition;
    totalMealIncome += ageMealIncome;

    let ageEducatorsSalary = 0;
    let ageAssistantsSalary = 0;

    for (const size of groupSizes) {
      const educ = educatorSalary(size, ratePerChild, extraPay, threshold);
      const asst = assistantSalary(size, assistantBase, extraPay, threshold);
      ageEducatorsSalary += educ;
      ageAssistantsSalary += asst;
      groupsList.push({
        age,
        childrenCount: size,
        educatorSalary: educ,
        assistantSalary: asst,
        totalStaffSalary: educ + asst,
      });
    }

    totalEducatorsSalary += ageEducatorsSalary;
    totalAssistantsSalary += ageAssistantsSalary;

    ageBreakdown[age] = {
      age,
      demanded: d,
      admitted,
      rejected,
      groupsCount: g,
      groupSizes,
      tuitionIncome: ageTuition,
      mealIncome: ageMealIncome,
      totalIncome: ageTuition + ageMealIncome,
      educatorsSalary: ageEducatorsSalary,
      assistantsSalary: ageAssistantsSalary,
    };
  }

  const totalGroups = (gVec[2] || 0) + (gVec[3] || 0) + (gVec[4] || 0) + (gVec[5] || 0);
  const totalAdmitted = Object.values(ageBreakdown).reduce((s, b) => s + b.admitted, 0);
  const totalRejected = Object.values(ageBreakdown).reduce((s, b) => s + b.rejected, 0);

  const clubTeachersCount = calculateClubTeachersCount(totalGroups);
  const totalClubTeachersSalary = clubTeachersCount * clubTeacherSalary(clubSalary);

  const activeManagersCount = totalGroups > 0 ? managersCount : 0;
  const totalManagerSalary = activeManagersCount * managerSalary(mgrSalary);

  const occupiedGroupRooms = totalGroups;
  const occupiedClubRooms = totalGroups > 0 ? clubRoomsCount : 0;
  const totalOccupiedRooms = occupiedGroupRooms + occupiedClubRooms;

  // Оренда: завжди оплачується за всі 20 кімнат будівлі (по 50 000 грн за кімнату) (Issue 3.2)
  const totalRoomsRent = totalRoomsCount * roomCost;

  const totalStaffSalaries =
    totalEducatorsSalary + totalAssistantsSalary + totalClubTeachersSalary + totalManagerSalary;
  // Собівартість харчування не враховується (Issue 3.1)
  const totalExpenses = totalStaffSalaries + totalRoomsRent;
  const totalIncome = totalTuitionIncome + totalMealIncome;
  const netProfit = totalIncome - totalExpenses;

  return {
    mode,
    gVec,
    totalGroups,
    totalAdmitted,
    totalRejected,
    occupiedGroupRooms,
    occupiedClubRooms,
    totalOccupiedRooms,
    clubTeachersCount,
    managersCount: activeManagersCount,
    tuitionIncome: totalTuitionIncome,
    mealIncome: totalMealIncome,
    totalIncome,
    totalEducatorsSalary,
    totalAssistantsSalary,
    totalClubTeachersSalary,
    totalManagerSalary,
    totalStaffSalaries,
    totalRoomsRent,
    totalExpenses,
    netProfit,
    ageBreakdown,
    groupsList,
  };
}

/**
 * Оптимізує економічну модель дитячого садка під динамічний віковий попит:
 * - Знаходить глобальний оптимум чистого прибутку;
 * - Відсікає збиткові залишки дітей, які вимагають відкриття напівпорожніх кімнат;
 * - Формує 3 найкращі конфігурації (topVariants);
 * - Формує 3 стратегії (MAX_PROFIT, ADMIT_ALL, COMFORT_QUALITY);
 * - Надає аналітику лімітів кімнат, гуртків та рекомендації для листа очікування.
 *
 * @param {Object} rawDemand
 * @param {Object} [options={}]
 */
function optimizeKindergartenCapacity(rawDemand, options = {}) {
  const demand = normalizeAgeDemand(rawDemand);
  validateOptions(options);

  const {
    totalRoomsCount = options.roomsCount ?? DEFAULT_TOTAL_ROOMS,
    clubRoomsCount = DEFAULT_CLUB_ROOMS,
    threshold = DEFAULT_EXTRA_PAY_THRESHOLD,
    tuition = 1500000,
    ratePerChild = 200000,
    extraPay = 300000,
    assistantBase = 2000000,
    roomCost = 5000000,
    clubSalary = 4000000,
    mealBasePerDay = 30000,
    mealPerExtraYear = 10000,
    workingDays = DEFAULT_WORKING_DAYS,
    maxChildrenInGroup = options.maxGroupSize ?? MAX_CHILDREN_PER_GROUP,
    attendanceRate = DEFAULT_ATTENDANCE_RATE,
  } = options;

  const maxGroupRooms = Math.max(0, totalRoomsCount - clubRoomsCount);
  const totalDemand = demand[2] + demand[3] + demand[4] + demand[5];

  const emptyConfig = evaluateConfiguration({ 2: 0, 3: 0, 4: 0, 5: 0 }, demand, options);

  if (totalDemand === 0 || maxGroupRooms === 0) {
    const emptyRecommended = {
      groupsCount: 0,
      roomsOccupied: 0,
      groupRoomsOccupied: 0,
      clubRoomsOccupied: 0,
      clubTeachersCount: 0,
      netProfit: emptyConfig.netProfit,
      totalAdmitted: 0,
      totalRejected: 0,
      gVec: emptyConfig.gVec,
      financials: {
        tuitionIncome: emptyConfig.tuitionIncome,
        mealIncome: emptyConfig.mealIncome,
        totalIncome: emptyConfig.totalIncome,
        expenses: {
          roomsRent: emptyConfig.totalRoomsRent,
          assistantsSalary: emptyConfig.totalAssistantsSalary,
          educatorsSalary: emptyConfig.totalEducatorsSalary,
          clubTeachersSalary: emptyConfig.totalClubTeachersSalary,
          managerSalary: emptyConfig.totalManagerSalary,
          totalStaffSalaries: emptyConfig.totalStaffSalaries,
          totalExpenses: emptyConfig.totalExpenses,
        },
        netProfit: emptyConfig.netProfit,
      },
      summary: 'Садок без відкритих груп. Прийнято 0 дітей.',
      ...emptyConfig,
    };

    const extraClub = CLUB_SUBJECTS_COUNT * clubTeacherSalary(clubSalary);
    const costJump = roomCost + assistantBase + extraClub;
    const baseTuition = tuitionMonthly(0, tuition);

    return {
      requestedDemand: { ...demand, totalChildren: totalDemand },
      recommended: emptyRecommended,
      topVariants: [{ rank: 1, name: 'Садок без відкритих груп', ...emptyConfig }],
      strategies: {
        maxProfit: {
          ...emptyConfig,
          strategyCode: 'MAX_PROFIT',
          title: 'Максимальний прибуток (Економічно вивірена)',
          description:
            'Точка глобального оптимуму витрат і доходів',
          profitDifference: 0,
        },
        comfortQuality: {
          ...emptyConfig,
          strategyCode: 'COMFORT_QUALITY',
          title: `Преміум комфорт (Групи строго до ${threshold} дітей)`,
          description: `Модель без доплат за переповнення (максимальний комфорт дітей та вихователів). Показує керівнику, скільки прибутку він «втрачає» заради статусу малих груп`,
          profitDifference: 0,
        },
        minimalInfrastructure: {
          ...emptyConfig,
          strategyCode: 'MINIMAL_INFRASTRUCTURE',
          title: 'Мінімум інфраструктури (Максимальне ущільнення до 20 дітей)',
          description:
            'Максимальне ущільнення груп до 20 дітей. Мінімум мороки з пошуком нових вихователів на ринку праці',
          profitDifference: 0,
        },
        admitAll: {
          ...emptyConfig,
          strategyCode: 'ADMIT_ALL',
          title: 'Максимальне охоплення (Всі можливі діти)',
          description:
            'Пріоритет — зарахувати всіх дітей із заявленого попиту, навіть якщо відкривається напівпорожня група',
          profitDifference: 0,
        },
      },
      marginalEconomics: {
        marginalChild: {
          childNumber: 1,
          marginalIncome: baseTuition,
          marginalCost: ratePerChild,
          marginalProfit: baseTuition - ratePerChild,
          insight: `Дитина №1 приносить +${Math.round((baseTuition - ratePerChild) / 100).toLocaleString('uk-UA')} грн/міс чистого прибутку.`,
        },
        clubTeachersStatus: {
          activeTeachers: 0,
          utilizedGroups: 0,
          maxGroupsCapacity: 0,
          freeGroupCapacity: 0,
          utilizationPercent: 0,
          insight: 'Штат викладачів гуртків не задіяний (0 груп).',
          warning: null,
        },
        expansionAnalysis: {
          canExpand: maxGroupRooms > 0,
          costJump,
          triggersNewClubSet: true,
          breakdown: {
            roomCost,
            assistantBase,
            clubTeachersCost: extraClub,
          },
          insight:
            maxGroupRooms > 0
              ? `Відкриття наступної групи вимагатиме стрибка витрат на +${Math.round(costJump / 100).toLocaleString('uk-UA')} грн.`
              : `Досягнуто ліміту приміщень (${totalRoomsCount} кімнат). Відкриття наступної групи неможливе без розширення будівлі.`,
        },
        roomsStatus: {
          totalAvailable: totalRoomsCount,
          occupiedTotal: emptyConfig.totalOccupiedRooms,
          occupiedGroupRooms: 0,
          occupiedClubRooms: emptyConfig.occupiedClubRooms,
          freeRooms: totalRoomsCount - emptyConfig.totalOccupiedRooms,
        },
        waitlistAdvice: [],
      },
    };
  }

  // Обмеження верхньої межі пошуку для кожної вікової категорії:
  // Ніколи не перебираємо g > demand[age], бо порожні групи (0 дітей) економічно нерентабельні (Issue 2.3)
  const maxG = {};
  for (let age = 2; age <= 5; age += 1) {
    maxG[age] = Math.min(maxGroupRooms, demand[age]);
  }

  const standardConfigs = [];
  const comfortConfigs = [];

  for (let g2 = 0; g2 <= maxG[2]; g2 += 1) {
    for (let g3 = 0; g3 <= Math.min(maxG[3], maxGroupRooms - g2); g3 += 1) {
      for (let g4 = 0; g4 <= Math.min(maxG[4], maxGroupRooms - g2 - g3); g4 += 1) {
        for (let g5 = 0; g5 <= Math.min(maxG[5], maxGroupRooms - g2 - g3 - g4); g5 += 1) {
          const gVec = { 2: g2, 3: g3, 4: g4, 5: g5 };

          const stdEval = evaluateConfiguration(gVec, demand, options, 'standard');
          standardConfigs.push(stdEval);

          const comfEval = evaluateConfiguration(gVec, demand, options, 'comfort');
          comfortConfigs.push(comfEval);
        }
      }
    }
  }

  // Сортуємо за прибутком спаданням
  standardConfigs.sort((a, b) => b.netProfit - a.netProfit);
  comfortConfigs.sort((a, b) => b.netProfit - a.netProfit);

  const maxProfitConfig = standardConfigs[0];

  // Використовуємо лінійний reduce замість Math.min(...array), щоб уникнути RangeError (Issue 4.1)
  const minRejected = standardConfigs.reduce(
    (min, c) => (c.totalRejected < min ? c.totalRejected : min),
    Infinity
  );
  const admitAllCandidates = standardConfigs.filter((c) => c.totalRejected === minRejected);
  admitAllCandidates.sort((a, b) => b.netProfit - a.netProfit);
  const admitAllConfig = admitAllCandidates[0];

  const minInfraCandidates = standardConfigs.filter((c) => c.totalRejected === minRejected);
  minInfraCandidates.sort((a, b) => a.totalGroups - b.totalGroups || b.netProfit - a.netProfit);
  const minimalInfraConfig = minInfraCandidates[0];

  const comfortConfig = comfortConfigs[0];

  const recommended = {
    groupsCount: maxProfitConfig.totalGroups,
    roomsOccupied: maxProfitConfig.totalOccupiedRooms,
    groupRoomsOccupied: maxProfitConfig.occupiedGroupRooms,
    clubRoomsOccupied: maxProfitConfig.occupiedClubRooms,
    clubTeachersCount: maxProfitConfig.clubTeachersCount,
    admittedChildren: maxProfitConfig.totalAdmitted,
    totalAdmitted: maxProfitConfig.totalAdmitted,
    netProfit: maxProfitConfig.netProfit,
    totalRejected: maxProfitConfig.totalRejected,
    gVec: maxProfitConfig.gVec,
    financials: {
      tuitionIncome: maxProfitConfig.tuitionIncome,
      mealIncome: maxProfitConfig.mealIncome,
      totalIncome: maxProfitConfig.totalIncome,
      expenses: {
        roomsRent: maxProfitConfig.totalRoomsRent,
        assistantsSalary: maxProfitConfig.totalAssistantsSalary,
        educatorsSalary: maxProfitConfig.totalEducatorsSalary,
        clubTeachersSalary: maxProfitConfig.totalClubTeachersSalary,
        managerSalary: maxProfitConfig.totalManagerSalary,
        totalStaffSalaries: maxProfitConfig.totalStaffSalaries,
        totalExpenses: maxProfitConfig.totalExpenses,
      },
      netProfit: maxProfitConfig.netProfit,
    },
    ageBreakdown: maxProfitConfig.ageBreakdown,
    summary: `Відкрити ${maxProfitConfig.totalGroups} груп, зайняти ${maxProfitConfig.totalOccupiedRooms} кімнат (${maxProfitConfig.occupiedGroupRooms} групових + ${maxProfitConfig.occupiedClubRooms} гурткових), найняти ${maxProfitConfig.clubTeachersCount} викладачів гуртків. Чистий прибуток: ${Math.round(maxProfitConfig.netProfit / 100).toLocaleString('uk-UA')} грн/міс.`,
    ...maxProfitConfig,
  };

  // Формуємо topVariants без Парето-домінованих варіантів (Issue 2.3):
  // Не включаємо варіанти, які приймають таку саму або меншу кількість дітей при більшій кількості груп і меншому прибутку
  const topVariants = [];
  const seenSignatures = new Set();

  for (const cfg of standardConfigs) {
    const isParetoDominated = topVariants.some(
      (chosen) =>
        chosen.totalAdmitted >= cfg.totalAdmitted &&
        chosen.totalGroups <= cfg.totalGroups &&
        chosen.netProfit >= cfg.netProfit
    );

    if (isParetoDominated && topVariants.length > 0) {
      continue;
    }

    const sig = `${cfg.totalGroups}_${cfg.totalAdmitted}_${cfg.netProfit}_${JSON.stringify(cfg.gVec)}`;
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      topVariants.push({
        rank: topVariants.length + 1,
        name:
          topVariants.length === 0
            ? 'Глобальний оптимум прибутку'
            : `Альтернативна модель (${cfg.totalGroups} груп, ${cfg.totalAdmitted} дітей)`,
        ...cfg,
      });
      if (topVariants.length === 3) break;
    }
  }

  // Розрахунок статусу гуртків та кімнат
  const clubSets =
    maxProfitConfig.totalGroups > 0
      ? Math.ceil(maxProfitConfig.totalGroups / MAX_GROUPS_PER_TEACHER)
      : 0;
  const maxClubCapacity = clubSets * MAX_GROUPS_PER_TEACHER;
  const freeClubCapacity = Math.max(0, maxClubCapacity - maxProfitConfig.totalGroups);

  const waitlistAdvice = [];
  const freeRooms = maxGroupRooms - maxProfitConfig.totalGroups;

  // Визначаємо конкуренцію вікових груп за спільні ресурси (Issue 2.6)
  const agesWithRejected = [2, 3, 4, 5].filter(
    (age) => maxProfitConfig.ageBreakdown[age]?.rejected > 0
  );
  const hasRoomCompetition = freeRooms > 0 && freeRooms < agesWithRejected.length;
  const hasClubCompetition = freeClubCapacity > 0 && freeClubCapacity < agesWithRejected.length;

  for (let age = 2; age <= 5; age += 1) {
    const ageData = maxProfitConfig.ageBreakdown[age];
    if (ageData && ageData.rejected > 0) {
      if (freeRooms <= 0) {
        waitlistAdvice.push({
          age,
          rejectedCount: ageData.rejected,
          reason: `Для дітей віку ${age} р. не вистачило місць: досягнуто ліміту групових кімнат (${maxGroupRooms} з ${totalRoomsCount} кімнат зайнято).`,
          actionableRecommendation:
            'Для прийому цих дітей потрібне розширення загального фонду кімнат або вивільнення кабінетів.',
        });
      } else {
        const triggersNewClubSet = maxProfitConfig.totalGroups + 1 > maxClubCapacity;
        const extraClubCost = triggersNewClubSet
          ? CLUB_SUBJECTS_COUNT * clubTeacherSalary(clubSalary)
          : 0;
        // Додаткові фіксовані витрати на персонал для відкриття нової групи
        const fixedBarrierCost = assistantBase + extraClubCost;

        // Точний пошук точки беззбитковості (breakEvenChildren) з урахуванням extraPay та відвідуваності (Issue 2.6, 3.4)
        const unitTuition = tuitionMonthly(0, tuition);
        const fullMeal = mealMonthly(age, workingDays, mealBasePerDay, mealPerExtraYear);
        const unitMealPrice = Math.round(fullMeal * attendanceRate);

        let breakEvenChildren = null;
        for (let n = 1; n <= maxChildrenInGroup; n += 1) {
          const revenue = n * (unitTuition + unitMealPrice);
          const educCost = educatorSalary(n, ratePerChild, extraPay, threshold);
          const asstExtra = n > threshold ? extraPay : 0;
          const totalMarginalCost = fixedBarrierCost + educCost + asstExtra;

          if (revenue >= totalMarginalCost) {
            breakEvenChildren = n;
            break;
          }
        }

        const competitionNote = hasRoomCompetition
          ? ` (Увага: у садку залишилося лише ${freeRooms} вільних групових кімнат на ${agesWithRejected.length} вікових груп з чергою)`
          : hasClubCompetition
            ? ` (Увага: у викладачів гуртків залишилося лише ${freeClubCapacity} вільних слотів для груп)`
            : '';

        if (breakEvenChildren !== null) {
          const additionalNeeded = Math.max(1, breakEvenChildren - ageData.rejected);
          waitlistAdvice.push({
            age,
            rejectedCount: ageData.rejected,
            barrierCost: fixedBarrierCost,
            breakEvenChildrenCount: breakEvenChildren,
            reason: `Відкриття нової групи для ${ageData.rejected} дітей створить додаткові фіксовані витрати на персонал на суму ${fixedBarrierCost / 100} грн/міс${triggersNewClubSet ? ' (включно з наймом ще 5 викладачів гуртків)' : ''}${competitionNote}, що перевищує дохід від них.`,
            actionableRecommendation: `Щоб відкриття нової групи для ${age}-річок стало вигідним, потрібно набрати мінімум ${breakEvenChildren} дітей (ще +${additionalNeeded} до поточного попиту).`,
            competitionWarning:
              hasRoomCompetition || hasClubCompetition ? competitionNote.trim() : null,
          });
        } else {
          waitlistAdvice.push({
            age,
            rejectedCount: ageData.rejected,
            barrierCost: fixedBarrierCost,
            breakEvenChildrenCount: null,
            reason: `Відкриття окремої нової групи для ${age}-річок не виходить на беззбитковість навіть при максимальній місткості кімнати (${maxChildrenInGroup} дітей) через фіксовані витрати ${fixedBarrierCost / 100} грн/міс${triggersNewClubSet ? ' (з новим комплектом гуртків)' : ''}.${competitionNote}`,
            actionableRecommendation:
              'Відкриття окремої групи економічно невигідне за поточних тарифів. Рекомендується оптимізувати постійні витрати або підвищити вартість навчання.',
            competitionWarning:
              hasRoomCompetition || hasClubCompetition ? competitionNote.trim() : null,
          });
        }
      }
    }
  }

  // Аналіз додаткової дитини (marginalChild)
  let marginalChild;
  if (maxProfitConfig.totalAdmitted < MAX_KINDERGARTEN_CAPACITY) {
    const nextChildNum = maxProfitConfig.totalAdmitted + 1;
    const baseTuition = tuitionMonthly(0, tuition);
    let marginalIncome = baseTuition;
    let marginalCost = ratePerChild;

    const groupWithSpace = maxProfitConfig.groupsList.find(
      (g) => g.childrenCount < maxChildrenInGroup
    );

    if (groupWithSpace) {
      if (groupWithSpace.childrenCount === threshold) {
        marginalCost += 2 * extraPay;
      }
    } else if (freeRooms > 0) {
      const triggersClub = maxProfitConfig.totalGroups + 1 > maxClubCapacity;
      const extraClub = triggersClub ? CLUB_SUBJECTS_COUNT * clubTeacherSalary(clubSalary) : 0;
      marginalCost += assistantBase + extraClub;
    }

    const marginalProfit = marginalIncome - marginalCost;
    const profitUah = Math.round(marginalProfit / 100);
    const sign = profitUah >= 0 ? '+' : '';
    marginalChild = {
      childNumber: nextChildNum,
      marginalIncome,
      marginalCost,
      marginalProfit,
      insight: `Дитина №${nextChildNum} приносить ${sign}${profitUah.toLocaleString('uk-UA')} грн/міс чистого прибутку.`,
    };
  } else {
    marginalChild = {
      childNumber: MAX_KINDERGARTEN_CAPACITY + 1,
      marginalIncome: 0,
      marginalCost: 0,
      marginalProfit: 0,
      insight: `Досягнуто максимальної місткості садка (${MAX_KINDERGARTEN_CAPACITY} дітей). Прийом нових дітей неможливий.`,
    };
  }

  // Аналіз статусу гуртків та масштабування (expansionAnalysis)
  const utilizationPercent =
    maxClubCapacity > 0
      ? Math.round((maxProfitConfig.totalGroups / maxClubCapacity) * 100)
      : 0;
  const clubInsight =
    maxClubCapacity > 0
      ? `Поточний штат гуртків заповнений на ${utilizationPercent}% (${maxProfitConfig.totalGroups} з ${maxClubCapacity} груп).`
      : 'Штат викладачів гуртків не задіяний (0 груп).';

  const triggersExpansionClubSet =
    maxProfitConfig.totalGroups === 0 || maxProfitConfig.totalGroups + 1 > maxClubCapacity;
  const expansionClubCost = triggersExpansionClubSet
    ? CLUB_SUBJECTS_COUNT * clubTeacherSalary(clubSalary)
    : 0;
  const costJump = roomCost + assistantBase + expansionClubCost;
  const costJumpUah = Math.round(costJump / 100);
  const expansionInsight =
    freeRooms > 0
      ? `Відкриття наступної групи вимагатиме стрибка витрат на +${costJumpUah.toLocaleString('uk-UA')} грн.`
      : `Досягнуто ліміту приміщень (${totalRoomsCount} кімнат). Відкриття наступної групи неможливе без розширення будівлі.`;

  const expansionAnalysis = {
    canExpand: freeRooms > 0,
    costJump,
    triggersNewClubSet: triggersExpansionClubSet,
    breakdown: {
      roomCost,
      assistantBase,
      clubTeachersCost: expansionClubCost,
    },
    insight: expansionInsight,
  };

  return {
    requestedDemand: {
      ...demand,
      totalChildren: totalDemand,
    },
    recommended,
    topVariants,
    strategies: {
      maxProfit: {
        strategyCode: 'MAX_PROFIT',
        title: 'Максимальний прибуток (Економічно вивірена)',
        description:
          'Точка глобального оптимуму витрат і доходів',
        profitDifference: 0,
        ...maxProfitConfig,
      },
      comfortQuality: {
        strategyCode: 'COMFORT_QUALITY',
        title: `Преміум комфорт (Групи строго до ${threshold} дітей)`,
        description: `Модель без доплат за переповнення (максимальний комфорт дітей та вихователів). Показує керівнику, скільки прибутку він «втрачає» заради статусу малих груп`,
        profitDifference: comfortConfig.netProfit - maxProfitConfig.netProfit,
        ...comfortConfig,
      },
      minimalInfrastructure: {
        strategyCode: 'MINIMAL_INFRASTRUCTURE',
        title: 'Мінімум інфраструктури (Максимальне ущільнення до 20 дітей)',
        description:
          'Максимальне ущільнення груп до 20 дітей. Мінімум мороки з пошуком нових вихователів на ринку праці',
        profitDifference: minimalInfraConfig.netProfit - maxProfitConfig.netProfit,
        ...minimalInfraConfig,
      },
      admitAll: {
        strategyCode: 'ADMIT_ALL',
        title: 'Максимальне охоплення (Всі можливі діти)',
        description:
          'Пріоритет — зарахувати всіх дітей із заявленого попиту, навіть якщо відкривається напівпорожня група',
        profitDifference: admitAllConfig.netProfit - maxProfitConfig.netProfit,
        ...admitAllConfig,
      },
    },
    marginalEconomics: {
      marginalChild,
      clubTeachersStatus: {
        activeTeachers: maxProfitConfig.clubTeachersCount,
        utilizedGroups: maxProfitConfig.totalGroups,
        maxGroupsCapacity: maxClubCapacity,
        freeGroupCapacity: freeClubCapacity,
        utilizationPercent,
        insight: clubInsight,
        warning:
          freeClubCapacity === 0 && maxProfitConfig.totalGroups > 0
            ? 'Викладачі гуртків завантажені на 100%. Відкриття ще однієї групи вимагатиме найму ще 5 викладачів гуртків.'
            : null,
      },
      expansionAnalysis,
      roomsStatus: {
        totalAvailable: totalRoomsCount,
        occupiedTotal: maxProfitConfig.totalOccupiedRooms,
        occupiedGroupRooms: maxProfitConfig.occupiedGroupRooms,
        occupiedClubRooms: maxProfitConfig.occupiedClubRooms,
        freeRooms: totalRoomsCount - maxProfitConfig.totalOccupiedRooms,
        insight:
          totalRoomsCount - maxProfitConfig.totalOccupiedRooms > 0
            ? `Вільних приміщень: ${totalRoomsCount - maxProfitConfig.totalOccupiedRooms} із ${totalRoomsCount} (використовується ${maxProfitConfig.totalOccupiedRooms}).`
            : `Усі доступні приміщення зайнято (${maxProfitConfig.totalOccupiedRooms} з ${totalRoomsCount}).`,
      },
      waitlistAdvice,
    },
  };
}

/**
 * Чиста функція розрахунку прогнозу доходів, витрат та прибутку садка для заданої кількості дітей.
 * Використовує узгоджені доменні функції та ціноутворення.
 *
 * @param {Object} options
 */
function calculateForecastDomain({
  targetChildrenCount,
  tuition = 1500000,
  ratePerChild = 200000,
  extraPay = 300000,
  assistantBase = 2000000,
  threshold = DEFAULT_EXTRA_PAY_THRESHOLD,
  clubSalary = 4000000,
  mgrSalary = 8000000,
  roomCost = 5000000,
  maxGroupSize = MAX_CHILDREN_PER_GROUP,
  maxCapacity = MAX_KINDERGARTEN_CAPACITY,
  clubTeachersCount,
  managersCount = DEFAULT_MANAGERS,
  roomsCount = DEFAULT_TOTAL_ROOMS,
} = {}) {
  assertTargetChildrenCount(targetChildrenCount, maxCapacity);

  const groupSizes = distributeChildrenIntoGroups(
    targetChildrenCount,
    maxGroupSize,
    maxCapacity,
    threshold
  );
  const groupsCount = groupSizes.length;
  const educatorsCount = groupsCount;
  const assistantsCount = groupsCount;

  let totalEducatorsSalary = 0;
  let totalAssistantsSalary = 0;

  const groups = groupSizes.map((count, index) => {
    const educator = educatorSalary(count, ratePerChild, extraPay, threshold);
    const assistant = assistantSalary(count, assistantBase, extraPay, threshold);
    totalEducatorsSalary += educator;
    totalAssistantsSalary += assistant;

    return {
      groupIndex: index + 1,
      childrenCount: count,
      educatorSalary: educator,
      assistantSalary: assistant,
      totalStaffSalary: educator + assistant,
    };
  });

  const actualClubTeachersCount =
    clubTeachersCount !== undefined ? clubTeachersCount : calculateClubTeachersCount(groupsCount);

  const groupsStaffSalaryFund = totalEducatorsSalary + totalAssistantsSalary;
  const totalClubTeachersSalary = actualClubTeachersCount * clubTeacherSalary(clubSalary);
  const totalManagerSalary = managersCount * managerSalary(mgrSalary);
  const totalStaffSalaries = groupsStaffSalaryFund + totalClubTeachersSalary + totalManagerSalary;

  // Оренда завжди за всі 20 кімнат будівлі садка (Issue 3.2)
  const totalRoomsRent = roomsCount * roomCost;

  const totalExpenses = totalStaffSalaries + totalRoomsRent;
  const baseTuition = tuitionMonthly(0, tuition);
  const projectedIncome = targetChildrenCount * baseTuition;
  const netProfit = projectedIncome - totalExpenses;

  return {
    targetChildrenCount,
    groupsCount,
    educatorsCount,
    assistantsCount,
    clubTeachersCount: actualClubTeachersCount,
    managersCount,
    roomsCount,
    baseTuition,
    projectedIncome,
    totalEducatorsSalary,
    totalAssistantsSalary,
    groupsStaffSalaryFund,
    totalClubTeachersSalary,
    totalManagerSalary,
    totalStaffSalaries,
    totalRoomsRent,
    totalExpenses,
    netProfit,
    groups,
  };
}

module.exports = {
  assertTargetChildrenCount,
  distributeChildrenOptimally,
  distributeChildrenIntoGroups,
  calculateForecastDomain,
  calculateClubTeachersCount,
  normalizeAgeDemand,
  evaluateConfiguration,
  optimizeKindergartenCapacity,
  validateOptions,
  MAX_KINDERGARTEN_CAPACITY,
  MAX_CHILDREN_PER_GROUP,
  MAX_GROUP_ROOMS,
  DEFAULT_TOTAL_ROOMS,
  DEFAULT_CLUB_ROOMS,
  DEFAULT_GROUP_ROOMS,
  DEFAULT_CLUB_TEACHERS,
  DEFAULT_MANAGERS,
  DEFAULT_EXTRA_PAY_THRESHOLD,
  CLUB_SUBJECTS_COUNT,
  LESSONS_PER_WEEK_PER_GROUP,
  TEACHER_WORK_HOURS_PER_DAY,
  WORK_DAYS_PER_WEEK,
  TEACHER_WEEKLY_CAPACITY,
  MAX_GROUPS_PER_TEACHER,
  DEFAULT_WORKING_DAYS,
  DEFAULT_ATTENDANCE_RATE,
};
