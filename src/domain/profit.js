const { mealMonthly, calculateChildMonthlyTuition } = require('./pricing');
const { educatorSalary, assistantSalary, clubTeacherSalary, managerSalary } = require('./salary');

// Місячний профіт садка. Одні й ті самі формули для:
// - GET  /analytics/groups/:id/profit — groupMonthlyProfit для однієї групи;
// - GET  /analytics/profit            — groupMonthlyProfit для кожної групи + sharedMonthlyCosts;
// - POST /analytics/forecast/calendar — те саме для кожного місяця з його робочими днями.
// Усі суми — у копійках.

const DEFAULT_CLUB_TEACHERS_COUNT = 5;
const DEFAULT_MANAGERS_COUNT = 1;
const CLUB_ROOMS_COUNT = 5;

/**
 * Профіт однієї групи за місяць.
 *
 * @param {object} group
 * @param {number|null} group.age вік групи (харчування за віком)
 * @param {object[]} group.children активні діти: { discountPercent, paymentPlan }
 * @param {number} [group.childrenCount] кількість активних дітей (за замовчуванням children.length)
 * @param {boolean} group.hasEducator призначений активний вихователь
 * @param {boolean} group.hasAssistant призначений активний помічник
 * @param {number} group.roomRent оренда кімнати групи
 * @param {object} rates ставки з налаштувань (див. AnalyticsService.rates)
 * @param {{ workingDays: number, attendanceRate: number }} period
 */
function groupMonthlyProfit(group, rates, { workingDays, attendanceRate }) {
  const childrenCount = group.childrenCount ?? group.children.length;

  const tuition = group.children.reduce(
    (sum, child) =>
      sum +
      calculateChildMonthlyTuition(
        child,
        rates.tuition,
        rates.discountLevels,
        rates.yearlyDiscountPercent
      ),
    0
  );
  const fullMonthMeal = group.age
    ? mealMonthly(group.age, workingDays, rates.mealBasePerDay, rates.mealPerExtraYear)
    : 0;
  const meal = childrenCount * Math.round(fullMonthMeal * attendanceRate);

  const educator = group.hasEducator
    ? educatorSalary(childrenCount, rates.educatorPerChild, rates.educatorExtraPay, rates.threshold)
    : 0;
  const assistant = group.hasAssistant
    ? assistantSalary(
        childrenCount,
        rates.assistantSalary,
        rates.assistantExtraPay,
        rates.threshold
      )
    : 0;

  const income = tuition + meal;
  const expenses = educator + assistant + group.roomRent;
  return {
    childrenCount,
    tuition,
    meal,
    income,
    educatorSalary: educator,
    assistantSalary: assistant,
    roomRent: group.roomRent,
    expenses,
    profit: income - expenses,
  };
}

/**
 * Спільні витрати садка за місяць — ті, що не належать жодній групі:
 * викладачі гуртків і їхні кабінети, менеджер, помічники без групи, оренда порожніх кімнат.
 * Профіт садка = сума профітів груп − total.
 *
 * @param {object} occupancy
 * @param {number} occupancy.groupsCount
 * @param {number} occupancy.groupRoomsRent сума оренди кімнат груп
 * @param {number} occupancy.assignedEducators активні вихователі, призначені в групи
 * @param {number} occupancy.assignedAssistants активні помічники, призначені в групи
 * @param {object|null} occupancy.staffCounts активний персонал за посадами з бази або null
 * @param {object} rates ставки з налаштувань
 */
function sharedMonthlyCosts(
  { groupsCount, groupRoomsRent, assignedEducators, assignedAssistants, staffCounts },
  rates
) {
  const clubTeachersCount = staffCounts?.CLUB_TEACHER ?? DEFAULT_CLUB_TEACHERS_COUNT;
  const managersCount = staffCounts?.MANAGER ?? DEFAULT_MANAGERS_COUNT;
  const educatorsCount = Math.max(assignedEducators, staffCounts?.EDUCATOR ?? assignedEducators);
  const assistantsCount = Math.max(
    assignedAssistants,
    staffCounts?.ASSISTANT ?? assignedAssistants
  );

  // Помічники в штаті без групи отримують базову ставку
  const unassignedAssistants = assistantsCount - assignedAssistants;
  const unassignedAssistantsSalary = unassignedAssistants * rates.assistantSalary;
  const clubTeachersSalary = clubTeachersCount * clubTeacherSalary(rates.clubTeacherSalary);
  const managersSalary = managersCount * managerSalary(rates.managerSalary);

  // Оренда: усі кімнати садка платні; кабінети гуртків і порожні кімнати — спільні витрати
  const clubRooms = Math.min(CLUB_ROOMS_COUNT, Math.max(0, rates.roomsCount - groupsCount));
  const clubRoomsRent = clubRooms * rates.roomMonthlyCost;
  const totalRoomsRent = rates.roomsCount * rates.roomMonthlyCost;
  const operatingRoomsRent = groupRoomsRent + clubRoomsRent;
  const idleRoomsRent = Math.max(0, totalRoomsRent - operatingRoomsRent);

  return {
    educatorsCount,
    assistantsCount,
    clubTeachersCount,
    managersCount,
    unassignedAssistants,
    clubRooms,
    vacantRooms: Math.max(0, rates.roomsCount - groupsCount - clubRooms),
    clubTeachersSalary,
    managerSalary: managersSalary,
    unassignedAssistantsSalary,
    clubRoomsRent,
    operatingRoomsRent,
    idleRoomsRent,
    total:
      clubTeachersSalary +
      managersSalary +
      unassignedAssistantsSalary +
      clubRoomsRent +
      idleRoomsRent,
  };
}

const SUM_FIELDS = Object.freeze([
  'childrenCount',
  'tuition',
  'meal',
  'income',
  'educatorSalary',
  'assistantSalary',
  'roomRent',
  'expenses',
  'profit',
]);

/** Сума результатів groupMonthlyProfit (напр. усіх груп одного віку) + кількість груп */
function sumGroupProfits(results) {
  const total = { groupsCount: results.length };
  for (const field of SUM_FIELDS) {
    total[field] = results.reduce((sum, result) => sum + result[field], 0);
  }
  return total;
}

module.exports = {
  groupMonthlyProfit,
  sharedMonthlyCosts,
  sumGroupProfits,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  CLUB_ROOMS_COUNT,
};
