const {
  groupMonthlyProfit,
  sharedMonthlyCosts,
  sumGroupProfits,
  DEFAULT_CLUB_TEACHERS_COUNT,
  DEFAULT_MANAGERS_COUNT,
  CLUB_ROOMS_COUNT,
} = require('../../../src/domain/profit');

const RATES = Object.freeze({
  tuition: 1500000,
  discountLevels: [10, 20, 30],
  yearlyDiscountPercent: 12,
  educatorPerChild: 200000,
  educatorExtraPay: 300000,
  assistantSalary: 2000000,
  assistantExtraPay: 300000,
  threshold: 12,
  clubTeacherSalary: 4000000,
  managerSalary: 8000000,
  roomMonthlyCost: 5000000,
  roomsCount: 20,
  mealBasePerDay: 30000,
  mealPerExtraYear: 10000,
});
const PERIOD = Object.freeze({ workingDays: 21, attendanceRate: 0.8 });

const child = (discountPercent = 0, paymentPlan = 'MONTHLY') => ({ discountPercent, paymentPlan });
const group = (overrides = {}) => ({
  age: 3,
  children: [child(), child(10)],
  hasEducator: true,
  hasAssistant: true,
  roomRent: 5000000,
  ...overrides,
});

describe('domain/profit', () => {
  test('константи', () => {
    expect(DEFAULT_CLUB_TEACHERS_COUNT).toBe(5);
    expect(DEFAULT_MANAGERS_COUNT).toBe(1);
    expect(CLUB_ROOMS_COUNT).toBe(5);
  });

  describe('groupMonthlyProfit', () => {
    test('група 3-річних із двома дітьми: усі складові', () => {
      // Навчання: 15 000 + 13 500 = 28 500 грн
      // Харчування: 400 грн × 21 день × 0,8 = 6 720 грн на дитину × 2 = 13 440 грн
      // Вихователь: 2 × 2 000 = 4 000; помічник: 20 000; кімната: 50 000
      expect(groupMonthlyProfit(group(), RATES, PERIOD)).toEqual({
        childrenCount: 2,
        tuition: 2850000,
        meal: 1344000,
        income: 4194000,
        educatorSalary: 400000,
        assistantSalary: 2000000,
        roomRent: 5000000,
        expenses: 7400000,
        profit: 4194000 - 7400000,
      });
    });

    test('річний план: −12% на навчання', () => {
      const result = groupMonthlyProfit(group({ children: [child(0, 'YEARLY')] }), RATES, PERIOD);
      expect(result.tuition).toBe(1320000);
    });

    test('харчування залежить від робочих днів місяця, навчання — ні', () => {
      const days19 = groupMonthlyProfit(group(), RATES, { workingDays: 19, attendanceRate: 0.8 });
      const days22 = groupMonthlyProfit(group(), RATES, { workingDays: 22, attendanceRate: 0.8 });
      expect(days19.meal).toBe(2 * Math.round(40000 * 19 * 0.8));
      expect(days22.meal).toBe(2 * Math.round(40000 * 22 * 0.8));
      expect(days19.tuition).toBe(days22.tuition);
    });

    test('0 робочих днів -> харчування 0', () => {
      const result = groupMonthlyProfit(group(), RATES, { workingDays: 0, attendanceRate: 0.8 });
      expect(result.meal).toBe(0);
    });

    test('без вихователя й помічника — їхні зарплати 0', () => {
      const result = groupMonthlyProfit(
        group({ hasEducator: false, hasAssistant: false }),
        RATES,
        PERIOD
      );
      expect(result.educatorSalary).toBe(0);
      expect(result.assistantSalary).toBe(0);
      expect(result.expenses).toBe(5000000);
    });

    test('група без віку — без харчування', () => {
      expect(groupMonthlyProfit(group({ age: null }), RATES, PERIOD).meal).toBe(0);
    });

    test('childrenCount має пріоритет над довжиною children', () => {
      const result = groupMonthlyProfit(group({ childrenCount: 3 }), RATES, PERIOD);
      expect(result.childrenCount).toBe(3);
      expect(result.educatorSalary).toBe(600000);
    });
  });

  describe('sharedMonthlyCosts', () => {
    const occupancy = (overrides = {}) => ({
      groupsCount: 4,
      groupRoomsRent: 4 * 5000000,
      assignedEducators: 4,
      assignedAssistants: 4,
      staffCounts: null,
      ...overrides,
    });

    test('штат за замовчуванням: 5 викладачів гуртків, 1 менеджер; 5 кабінетів, 11 порожніх кімнат', () => {
      const shared = sharedMonthlyCosts(occupancy(), RATES);
      expect(shared).toMatchObject({
        clubTeachersCount: 5,
        managersCount: 1,
        clubRooms: 5,
        vacantRooms: 11,
        clubTeachersSalary: 20000000,
        managerSalary: 8000000,
        unassignedAssistantsSalary: 0,
        clubRoomsRent: 25000000,
        operatingRoomsRent: 45000000,
        idleRoomsRent: 55000000,
      });
      expect(shared.total).toBe(20000000 + 8000000 + 25000000 + 55000000);
    });

    test('оренда груп + спільна оренда = оренда всіх 20 кімнат', () => {
      const shared = sharedMonthlyCosts(occupancy(), RATES);
      expect(4 * 5000000 + shared.clubRoomsRent + shared.idleRoomsRent).toBe(20 * 5000000);
    });

    test('штат із бази; помічник без групи отримує базову ставку', () => {
      const shared = sharedMonthlyCosts(
        occupancy({ staffCounts: { CLUB_TEACHER: 3, MANAGER: 2, EDUCATOR: 6, ASSISTANT: 6 } }),
        RATES
      );
      expect(shared).toMatchObject({
        clubTeachersCount: 3,
        managersCount: 2,
        educatorsCount: 6,
        assistantsCount: 6,
        unassignedAssistants: 2,
        unassignedAssistantsSalary: 2 * 2000000,
        clubTeachersSalary: 3 * 4000000,
        managerSalary: 2 * 8000000,
      });
    });

    test('у базі менше персоналу, ніж призначено в групи — береться призначений', () => {
      const shared = sharedMonthlyCosts(
        occupancy({ staffCounts: { EDUCATOR: 1, ASSISTANT: 1 } }),
        RATES
      );
      expect(shared.educatorsCount).toBe(4);
      expect(shared.assistantsCount).toBe(4);
      expect(shared.unassignedAssistants).toBe(0);
      expect(shared.clubTeachersCount).toBe(5);
    });

    test('20 груп: кабінетів гуртків не лишається, простою немає', () => {
      const shared = sharedMonthlyCosts(
        occupancy({ groupsCount: 20, groupRoomsRent: 20 * 5000000 }),
        RATES
      );
      expect(shared.clubRooms).toBe(0);
      expect(shared.vacantRooms).toBe(0);
      expect(shared.idleRoomsRent).toBe(0);
    });
  });

  test('sumGroupProfits: суми полів і кількість груп', () => {
    const a = groupMonthlyProfit(group(), RATES, PERIOD);
    const b = groupMonthlyProfit(group({ children: [child()] }), RATES, PERIOD);
    const sum = sumGroupProfits([a, b]);
    expect(sum.groupsCount).toBe(2);
    expect(sum.childrenCount).toBe(3);
    expect(sum.profit).toBe(a.profit + b.profit);
    expect(sum.income - sum.expenses).toBe(sum.profit);
    expect(sumGroupProfits([])).toMatchObject({ groupsCount: 0, profit: 0, childrenCount: 0 });
  });
});
