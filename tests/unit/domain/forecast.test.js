const { BadRequestError } = require('../../../src/errors/AppError');
const { ErrorCodes } = require('../../../src/errors/errorCodes');
const {
  assertTargetChildrenCount,
  distributeChildrenOptimally,
  distributeChildrenIntoGroups,
  calculateClubTeachersCount,
  normalizeAgeDemand,
  validateOptions,
  evaluateConfiguration,
  optimizeKindergartenCapacity,
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
} = require('../../../src/domain/forecast');

describe('Domain: forecast (src/domain/forecast.js)', () => {
  describe('Константи за замовчуванням та розклад', () => {
    test('експортує всі нормативні константи', () => {
      expect(MAX_KINDERGARTEN_CAPACITY).toBe(300);
      expect(MAX_CHILDREN_PER_GROUP).toBe(20);
      expect(MAX_GROUP_ROOMS).toBe(15);
      expect(DEFAULT_TOTAL_ROOMS).toBe(20);
      expect(DEFAULT_CLUB_ROOMS).toBe(5);
      expect(DEFAULT_GROUP_ROOMS).toBe(15);
      expect(DEFAULT_CLUB_TEACHERS).toBe(5);
      expect(DEFAULT_MANAGERS).toBe(1);
      expect(DEFAULT_EXTRA_PAY_THRESHOLD).toBe(12);

      expect(CLUB_SUBJECTS_COUNT).toBe(5);
      expect(LESSONS_PER_WEEK_PER_GROUP).toBe(3);
      expect(TEACHER_WORK_HOURS_PER_DAY).toBe(8);
      expect(WORK_DAYS_PER_WEEK).toBe(5);
      expect(TEACHER_WEEKLY_CAPACITY).toBe(45);
      expect(MAX_GROUPS_PER_TEACHER).toBe(15);
      expect(DEFAULT_WORKING_DAYS).toBe(21);
    });
  });

  describe('assertTargetChildrenCount', () => {
    test.each([0, 1, 20, 150, 299, 300])('валідні значення %d не викидають помилку', (count) => {
      expect(() => assertTargetChildrenCount(count)).not.toThrow();
    });

    test('301 дитина перевищує максимальну місткість 300 -> BadRequestError', () => {
      expect(() => assertTargetChildrenCount(301)).toThrow(BadRequestError);
      expect(() => assertTargetChildrenCount(301)).toThrow(
        /cannot exceed maximum capacity of 300/i
      );
    });

    test.each([-1, -100])('від’ємні значення %d -> BadRequestError', (count) => {
      expect(() => assertTargetChildrenCount(count)).toThrow(BadRequestError);
      expect(() => assertTargetChildrenCount(count)).toThrow(/non-negative integer/i);
    });

    test.each([15.5, NaN, '150', null, undefined, {}])(
      'невалідні типи та дробові числа (%p) -> BadRequestError',
      (val) => {
        expect(() => assertTargetChildrenCount(val)).toThrow(BadRequestError);
      }
    );

    test('кастомний maxCapacity перевіряється коректно', () => {
      expect(() => assertTargetChildrenCount(50, 50)).not.toThrow();
      expect(() => assertTargetChildrenCount(51, 50)).toThrow(BadRequestError);
    });
  });

  describe('distributeChildrenOptimally', () => {
    test('порожній результат при 0 дітей або 0 груп', () => {
      expect(distributeChildrenOptimally(0, 5)).toEqual([]);
      expect(distributeChildrenOptimally(20, 0)).toEqual([]);
      expect(distributeChildrenOptimally(0, 0)).toEqual([]);
    });

    test('викидає BadRequestError при невалідних аргументах', () => {
      expect(() => distributeChildrenOptimally(-1, 2)).toThrow(BadRequestError);
      expect(() => distributeChildrenOptimally(10, -1)).toThrow(BadRequestError);
      expect(() => distributeChildrenOptimally(10.5, 2)).toThrow(BadRequestError);
      expect(() => distributeChildrenOptimally(10, 2.5)).toThrow(BadRequestError);
    });

    test('дітей <= g * threshold: рівномірний розподіл (жодна група не перевищує поріг 12)', () => {
      // 11 дітей на 2 групи -> [6, 5], жодна не перевищує 12
      expect(distributeChildrenOptimally(11, 2, 12, 20)).toEqual([6, 5]);

      // 24 дитини на 2 групи -> [12, 12], обидві рівно 12 (нуль доплат extraPay)
      expect(distributeChildrenOptimally(24, 2, 12, 20)).toEqual([12, 12]);

      // 36 дітей на 3 групи -> [12, 12, 12]
      expect(distributeChildrenOptimally(36, 3, 12, 20)).toEqual([12, 12, 12]);
    });

    test('дітей > g * threshold: асиметричний розподіл (Issue 2.1)', () => {
      // Контрприклад 1 з ТЗ: 26 дітей на 2 групи
      // Замість [13, 13] (де обидві платять extraPay), має бути [14, 12] (лише 1 група платить extraPay)
      const res26 = distributeChildrenOptimally(26, 2, 12, 20);
      expect(res26).toEqual([14, 12]);
      expect(res26.filter((s) => s > 12)).toHaveLength(1);

      // Контрприклад 2 з ТЗ: 39 дітей на 3 групи
      // Замість [13, 13, 13] (де всі 3 платять extraPay), має бути [15, 12, 12] (лише 1 група платить extraPay)
      const res39 = distributeChildrenOptimally(39, 3, 12, 20);
      expect(res39).toEqual([15, 12, 12]);
      expect(res39.filter((s) => s > 12)).toHaveLength(1);

      // 35 дітей на 2 групи -> [20, 15] (обидві перевищують 12, перша заповнена до максимуму 20)
      expect(distributeChildrenOptimally(35, 2, 12, 20)).toEqual([20, 15]);
    });
  });

  describe('distributeChildrenIntoGroups', () => {
    test('0 дітей -> порожній масив груп []', () => {
      expect(distributeChildrenIntoGroups(0)).toEqual([]);
    });

    test('1 дитина -> одна група з 1 дитиною', () => {
      expect(distributeChildrenIntoGroups(1)).toEqual([1]);
    });

    test('20 дітей -> одна група з 20 дітьми', () => {
      expect(distributeChildrenIntoGroups(20)).toEqual([20]);
    });

    test('21 дитина -> 2 групи [11, 10]', () => {
      expect(distributeChildrenIntoGroups(21)).toEqual([11, 10]);
    });

    test('150 дітей -> 8 груп, загальна сума 150', () => {
      const groups = distributeChildrenIntoGroups(150);
      expect(groups).toHaveLength(8);
      expect(groups.reduce((a, b) => a + b, 0)).toBe(150);
    });

    test('300 дітей -> 15 груп по 20 дітей', () => {
      const groups = distributeChildrenIntoGroups(300);
      expect(groups).toHaveLength(15);
      expect(groups).toEqual(Array(15).fill(20));
      expect(groups.reduce((a, b) => a + b, 0)).toBe(300);
    });

    test('викидає BadRequestError для 301 дитини', () => {
      expect(() => distributeChildrenIntoGroups(301)).toThrow(BadRequestError);
    });
  });

  describe('calculateClubTeachersCount', () => {
    test('0 груп -> 0 викладачів', () => {
      expect(calculateClubTeachersCount(0)).toBe(0);
    });

    test('від 1 до 15 груп -> 1 комплект (5 викладачів)', () => {
      expect(calculateClubTeachersCount(1)).toBe(5);
      expect(calculateClubTeachersCount(6)).toBe(5);
      expect(calculateClubTeachersCount(13)).toBe(5);
      expect(calculateClubTeachersCount(15)).toBe(5);
    });

    test('від 16 до 30 груп -> 2 комплекти (10 викладачів)', () => {
      expect(calculateClubTeachersCount(16)).toBe(10);
      expect(calculateClubTeachersCount(20)).toBe(10);
      expect(calculateClubTeachersCount(30)).toBe(10);
    });

    test('від 31 до 45 груп -> 3 комплекти (15 викладачів)', () => {
      expect(calculateClubTeachersCount(31)).toBe(15);
      expect(calculateClubTeachersCount(45)).toBe(15);
    });

    test('46 груп -> 4 комплекти (20 викладачів)', () => {
      expect(calculateClubTeachersCount(46)).toBe(20);
    });

    test('невалідні значення викидають BadRequestError з кодом VALIDATION_ERROR', () => {
      try {
        calculateClubTeachersCount(-1);
        throw new Error('Should have failed');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestError);
        expect(err.code).toBe(ErrorCodes.VALIDATION_ERROR);
      }

      expect(() => calculateClubTeachersCount(2.5)).toThrow(BadRequestError);
      expect(() => calculateClubTeachersCount('5')).toThrow(BadRequestError);
    });
  });

  describe('normalizeAgeDemand', () => {
    test('нормалізує звичайний об’єкт з числовими ключами', () => {
      const res = normalizeAgeDemand({ 2: 15, 3: 20, 4: 25, 5: 30 });
      expect(res).toEqual({ 2: 15, 3: 20, 4: 25, 5: 30 });
    });

    test('підтримує аліаси age2, age_3 тощо', () => {
      const res = normalizeAgeDemand({ age2: 10, age_3: 15, 4: 20, age5: 25 });
      expect(res).toEqual({ 2: 10, 3: 15, 4: 20, 5: 25 });
    });

    test('підтримує вкладений demand або ageGroups', () => {
      const res1 = normalizeAgeDemand({ demand: { 2: 5, 3: 10, 4: 15, 5: 20 } });
      expect(res1).toEqual({ 2: 5, 3: 10, 4: 15, 5: 20 });

      const res2 = normalizeAgeDemand({ ageGroups: { 2: 8, 3: 8, 4: 8, 5: 8 } });
      expect(res2).toEqual({ 2: 8, 3: 8, 4: 8, 5: 8 });
    });

    test('підтримує targetChildrenCount та рівномірно розподіляє дітей за віком', () => {
      expect(normalizeAgeDemand({ targetChildrenCount: 0 })).toEqual({ 2: 0, 3: 0, 4: 0, 5: 0 });
      expect(normalizeAgeDemand({ targetChildrenCount: 150 })).toEqual({
        2: 38,
        3: 38,
        4: 37,
        5: 37,
      });
      expect(normalizeAgeDemand({ targetChildrenCount: 300 })).toEqual({
        2: 75,
        3: 75,
        4: 75,
        5: 75,
      });
    });

    test('targetChildrenCount > 300 викидає BadRequestError', () => {
      expect(() => normalizeAgeDemand({ targetChildrenCount: 301 })).toThrow(BadRequestError);
      expect(() => normalizeAgeDemand({ targetChildrenCount: 301 })).toThrow(
        /cannot exceed maximum capacity of 300/i
      );
    });

    test('від’ємний targetChildrenCount викидає BadRequestError', () => {
      expect(() => normalizeAgeDemand({ targetChildrenCount: -1 })).toThrow(BadRequestError);
    });

    test('відсутні вікові категорії за замовчуванням дорівнюють 0', () => {
      const res = normalizeAgeDemand({ 2: 10 });
      expect(res).toEqual({ 2: 10, 3: 0, 4: 0, 5: 0 });
    });

    test('порожній об’єкт повертає всі нулі', () => {
      expect(normalizeAgeDemand({})).toEqual({ 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    test('відхиляє масив замість об’єкта (Issue 4.3)', () => {
      expect(() => normalizeAgeDemand([10, 20, 30, 40])).toThrow(BadRequestError);
    });

    test('відхиляє boolean значення (Issue 4.3)', () => {
      expect(() => normalizeAgeDemand({ 2: true })).toThrow(BadRequestError);
      expect(() => normalizeAgeDemand({ 2: false })).toThrow(BadRequestError);
    });

    test('відхиляє порожні та пробільні рядки (Issue 4.3)', () => {
      expect(() => normalizeAgeDemand({ 2: '' })).toThrow(BadRequestError);
      expect(() => normalizeAgeDemand({ 2: '   ' })).toThrow(BadRequestError);
    });

    test('відхиляє дробові числа та від’ємні значення', () => {
      expect(() => normalizeAgeDemand({ 2: 10.5 })).toThrow(BadRequestError);
      expect(() => normalizeAgeDemand({ 3: -5 })).toThrow(BadRequestError);
    });

    test('відхиляє попит понад 10000', () => {
      expect(() => normalizeAgeDemand({ 2: 10001 })).toThrow(BadRequestError);
    });
  });

  describe('validateOptions', () => {
    test('валідні опції проходять успішно', () => {
      expect(() =>
        validateOptions({
          threshold: 12,
          maxChildrenInGroup: 20,
          totalRoomsCount: 20,
          clubRoomsCount: 5,
          workingDays: 21,
          mealCostRatio: 1.0,
        })
      ).not.toThrow();
    });

    test('threshold > maxChildrenInGroup викидає помилку (Issue 4.3)', () => {
      expect(() =>
        validateOptions({
          threshold: 25,
          maxChildrenInGroup: 20,
        })
      ).toThrow(/cannot exceed maxChildrenInGroup/i);
    });

    test('від’ємні або дробові числа викидають помилку', () => {
      expect(() => validateOptions({ threshold: -1 })).toThrow(BadRequestError);
      expect(() => validateOptions({ maxChildrenInGroup: 0 })).toThrow(BadRequestError);
      expect(() => validateOptions({ totalRoomsCount: -5 })).toThrow(BadRequestError);
      expect(() => validateOptions({ clubRoomsCount: 2.5 })).toThrow(BadRequestError);
      expect(() => validateOptions({ workingDays: -1 })).toThrow(BadRequestError);
      expect(() => validateOptions({ assistantExtra: -1 })).toThrow(BadRequestError);
      expect(() => validateOptions({ assistantExtra: 2.5 })).toThrow(BadRequestError);
      expect(() => validateOptions({ assistantExtra: 'invalid' })).toThrow(BadRequestError);
    });

    test('attendanceRate поза межами (0, 1] викидає помилку', () => {
      expect(() => validateOptions({ attendanceRate: 1.5 })).toThrow(BadRequestError);
      expect(() => validateOptions({ attendanceRate: 0 })).toThrow(BadRequestError);
      expect(() => validateOptions({ attendanceRate: -0.1 })).toThrow(BadRequestError);
      expect(() => validateOptions({ attendanceRate: '0.8' })).toThrow(BadRequestError);
    });
  });

  describe('evaluateConfiguration', () => {
    const demand = { 2: 26, 3: 0, 4: 0, 5: 0 };
    const options = {
      tuition: 1500000,
      ratePerChild: 200000,
      extraPay: 300000,
      assistantBase: 2000000,
      threshold: 12,
      clubSalary: 4000000,
      mgrSalary: 8000000,
      roomCost: 5000000,
      totalRoomsCount: 20,
      clubRoomsCount: 5,
      maxChildrenInGroup: 20,
    };

    test('режим standard: 2 групи для 26 дітей розподіляються асиметрично [14, 12]', () => {
      const gVec = { 2: 2, 3: 0, 4: 0, 5: 0 };
      const evalRes = evaluateConfiguration(gVec, demand, options, 'standard');

      expect(evalRes.totalGroups).toBe(2);
      expect(evalRes.totalAdmitted).toBe(26);
      expect(evalRes.totalRejected).toBe(0);
      expect(evalRes.ageBreakdown[2].groupSizes).toEqual([14, 12]);

      // Перевірка зарплат:
      // Група 1 (14 дітей > 12): вихователь 14*2000 + 2*3000 = 34 000 грн; асистент 20 000 + 2*3000 = 26 000 грн
      // Група 2 (12 дітей <= 12): вихователь 12*2000 = 24 000 грн; асистент 20 000 грн (БЕЗ extraPay!)
      expect(evalRes.ageBreakdown[2].educatorsSalary).toBe(3400000 + 2400000);
      expect(evalRes.ageBreakdown[2].assistantsSalary).toBe(2600000 + 2000000);
    });

    test('режим comfort: групи обмежені порогом threshold (12 дітей)', () => {
      const gVec = { 2: 2, 3: 0, 4: 0, 5: 0 };
      const evalRes = evaluateConfiguration(gVec, demand, options, 'comfort');

      expect(evalRes.totalGroups).toBe(2);
      // 2 групи по максимум 12 дітей = 24 дитини прийнято, 2 відхилено
      expect(evalRes.totalAdmitted).toBe(24);
      expect(evalRes.totalRejected).toBe(2);
      expect(evalRes.ageBreakdown[2].groupSizes).toEqual([12, 12]);
      // Жодна група не платить extraPay
      expect(evalRes.ageBreakdown[2].assistantsSalary).toBe(4000000); // 2 * 20 000 грн
    });

    test('захист від збиткового набору понад threshold у режимі standard (Issue 2.5)', () => {
      // Кастомні опції: низька вартість навчання та високий extraPay,
      // коли 13-та дитина приносить менше, ніж коштує extraPay
      const customOptions = {
        ...options,
        tuition: 300000, // 3 000 грн
        ratePerChild: 200000, // 2 000 грн маржа = 1 000 грн
        extraPay: 400000, // 4 000 грн вихователю + 4 000 грн помічнику = 8 000 грн доплат
        threshold: 12,
      };
      // 13 дітей на 1 групу: 13-та дитина принесе 1000 грн маржі, але викличе 8000 грн extraPay (збиток -7000 грн)
      const gVec = { 2: 1, 3: 0, 4: 0, 5: 0 };
      const evalRes = evaluateConfiguration(
        gVec,
        { 2: 13, 3: 0, 4: 0, 5: 0 },
        customOptions,
        'standard'
      );

      // Алгоритм зупиняє набір на 12 дітях
      expect(evalRes.totalAdmitted).toBe(12);
      expect(evalRes.totalRejected).toBe(1);
    });

    test('оренда завжди розраховується за всі 20 кімнат будівлі (по 50 000 грн) (Issue 3.2)', () => {
      const gVec = { 2: 1, 3: 0, 4: 0, 5: 0 };
      const evalRes = evaluateConfiguration(gVec, demand, options);
      expect(evalRes.totalRoomsRent).toBe(20 * 5000000);
    });

    test('дохід від харчування враховує відвідуваність через хвороби дітей без собівартості (Issues 3.1, 3.4)', () => {
      const gVec = { 2: 1, 3: 0, 4: 0, 5: 0 };

      // За замовчуванням attendanceRate = 0.8
      const eval80 = evaluateConfiguration(gVec, { 2: 10, 3: 0, 4: 0, 5: 0 }, options);
      const fullMonthMeal = 21 * 30000; // 630 000 коп
      const expectedMealIncome = 10 * Math.round(fullMonthMeal * 0.8);
      expect(eval80.ageBreakdown[2].mealIncome).toBe(expectedMealIncome);
      // Собівартість харчування не враховується у витратах: totalExpenses = staff + roomsRent
      expect(eval80.totalExpenses).toBe(eval80.totalStaffSalaries + eval80.totalRoomsRent);

      // При attendanceRate = 1.0 (100% відвідуваність)
      const eval100 = evaluateConfiguration(
        gVec,
        { 2: 10, 3: 0, 4: 0, 5: 0 },
        { ...options, attendanceRate: 1.0 }
      );
      expect(eval100.ageBreakdown[2].mealIncome).toBe(10 * fullMonthMeal);
    });
  });

  describe('optimizeKindergartenCapacity', () => {
    test('нульовий попит (demand = 0 для всіх вікових категорій)', () => {
      const res = optimizeKindergartenCapacity({ 2: 0, 3: 0, 4: 0, 5: 0 });

      expect(res.requestedDemand.totalChildren).toBe(0);
      expect(res.topVariants).toHaveLength(1);
      expect(res.topVariants[0].totalAdmitted).toBe(0);
      expect(res.strategies.maxProfit.totalGroups).toBe(0);
      expect(res.strategies.maxProfit.netProfit).toBe(-100000000); // оренда 20 кімнат
      expect(res.strategies.admitAll.totalGroups).toBe(0);
      expect(res.strategies.comfortQuality.totalGroups).toBe(0);
      expect(res.marginalEconomics.roomsStatus.occupiedTotal).toBe(0);
      expect(res.marginalEconomics.waitlistAdvice).toEqual([]);
    });

    test('totalRoomsCount <= clubRoomsCount не падає з TypeError (Issue 1.3)', () => {
      const res = optimizeKindergartenCapacity(
        { 2: 10, 3: 10, 4: 10, 5: 10 },
        { totalRoomsCount: 5, clubRoomsCount: 5 }
      );

      expect(res).toBeDefined();
      expect(res.strategies.maxProfit.totalGroups).toBe(0);
      expect(res.topVariants[0].totalGroups).toBe(0);
    });

    test('нерентабельний попит (1 дитина): MAX_PROFIT обирає 0 груп замість збиткового відкриття садка (Issue 2.4)', () => {
      const res = optimizeKindergartenCapacity({ 2: 0, 3: 1, 4: 0, 5: 0 });

      // 0 груп має збиток лише на оренду (-1 000 000 грн), що вигідніше за збиток від найму персоналу під 1 дитину
      expect(res.strategies.maxProfit.totalGroups).toBe(0);
      expect(res.strategies.maxProfit.netProfit).toBe(-100000000);
      expect(res.strategies.maxProfit.totalAdmitted).toBe(0);

      // А ось ADMIT_ALL обов’язково відкриє 1 групу
      expect(res.strategies.admitAll.totalGroups).toBe(1);
      expect(res.strategies.admitAll.totalAdmitted).toBe(1);
      expect(res.strategies.admitAll.netProfit).toBeLessThan(-100000000);
    });

    test('реалістичний попит: коректні стратегії, waitlistAdvice та відсутність Парето-домінованих варіантів (Issues 2.3, 2.6)', () => {
      const demand = { 2: 25, 3: 45, 4: 35, 5: 20 };
      const res = optimizeKindergartenCapacity(demand);

      expect(res.requestedDemand.totalChildren).toBe(125);
      expect(res.topVariants).toBeInstanceOf(Array);
      expect(res.topVariants.length).toBeGreaterThan(0);
      expect(res.topVariants.length).toBeLessThanOrEqual(3);

      // Перевірка стратегій
      expect(res.strategies.maxProfit.strategyCode).toBe('MAX_PROFIT');
      expect(res.strategies.admitAll.strategyCode).toBe('ADMIT_ALL');
      expect(res.strategies.comfortQuality.strategyCode).toBe('COMFORT_QUALITY');

      // Динамічний заголовок стратегії COMFORT_QUALITY (Issue 4.3)
      expect(res.strategies.comfortQuality.title).toContain('12 дітей');

      // Перевірка waitlistAdvice:
      // Якщо є відхилені діти, порада повинна містити точний breakEvenChildrenCount з урахуванням extraPay
      for (const advice of res.marginalEconomics.waitlistAdvice) {
        expect(advice.age).toBeDefined();
        expect(advice.rejectedCount).toBeGreaterThan(0);
        expect(typeof advice.reason).toBe('string');
        expect(typeof advice.actionableRecommendation).toBe('string');
        // Перевірка, що вираз у рекомендації не містить NaN або мінусів без числа
        expect(advice.actionableRecommendation).not.toContain('NaN');
        expect(advice.actionableRecommendation).not.toContain('undefined');
      }

      // Перевірка статусу викладачів гуртків
      expect(res.marginalEconomics.clubTeachersStatus.maxGroupsCapacity).toBeGreaterThanOrEqual(
        res.marginalEconomics.clubTeachersStatus.utilizedGroups
      );
    });

    test('waitlistAdvice: коли всі групові кімнати вичерпано (freeRooms <= 0)', () => {
      // 15 кімнат повністю зайнято, є відхилені діти
      const demand = { 2: 80, 3: 80, 4: 80, 5: 80 }; // 320 дітей > 300 місткості
      const res = optimizeKindergartenCapacity(demand);

      expect(res.strategies.maxProfit.totalGroups).toBe(15);
      const advice = res.marginalEconomics.waitlistAdvice.find((a) =>
        a.reason.includes('досягнуто ліміту групових кімнат')
      );
      expect(advice).toBeDefined();
      expect(advice.actionableRecommendation).toContain(
        'потрібне розширення загального фонду кімнат'
      );
    });

    test('waitlistAdvice: конкуренція за останню вільну кімнату та випадок недосяжності breakEven (Issue 2.6)', () => {
      // 1 вільна кімната (totalRoomsCount = 6, clubRoomsCount = 5 -> maxGroupRooms = 1)
      // Попит у кількох вікових категоріях: обидві претендують на 1 кімнату
      const res = optimizeKindergartenCapacity(
        { 2: 20, 3: 20, 4: 0, 5: 0 },
        { totalRoomsCount: 7, clubRoomsCount: 5 } // 2 кімнати для груп
      );

      // Перевірка, що якщо є кімнати або місця, додається competitionWarning або правильна порада
      expect(res.marginalEconomics.waitlistAdvice).toBeInstanceOf(Array);
    });

    test('waitlistAdvice: коли відкриття нової групи взагалі недосяжне за рентабельністю (null breakEven)', () => {
      // Дуже низька оплата навчання та висока вартість кімнати
      const res = optimizeKindergartenCapacity(
        { 2: 15, 3: 0, 4: 0, 5: 0 },
        {
          tuition: 100000, // 1 000 грн
          roomCost: 50000000, // 500 000 грн
          rentModel: 'occupied',
        }
      );

      const advice = res.marginalEconomics.waitlistAdvice.find((a) => a.age === 2);
      if (advice) {
        expect(advice.breakEvenChildrenCount).toBeNull();
        expect(advice.reason).toContain('не виходить на беззбитковість');
      }
    });

    test('кастомний threshold відображається у заголовку стратегії COMFORT_QUALITY', () => {
      const res = optimizeKindergartenCapacity(
        { 2: 15, 3: 15, 4: 0, 5: 0 },
        { threshold: 10, maxChildrenInGroup: 20 }
      );

      expect(res.strategies.comfortQuality.title).toContain('10 дітей');
    });

    test('структура відповіді містить Секцію 1 (recommended), Секцію 2 (strategies) та Секцію 3 (marginalEconomics)', () => {
      const res = optimizeKindergartenCapacity({ 2: 25, 3: 45, 4: 35, 5: 20 });

      // Секція 1: recommended (Абсолютний фінансовий оптимум)
      expect(res.recommended).toBeDefined();
      expect(res.recommended.groupsCount).toBeGreaterThan(0);
      expect(res.recommended.roomsOccupied).toBe(
        res.recommended.groupRoomsOccupied + res.recommended.clubRoomsOccupied
      );
      expect(res.recommended.clubTeachersCount).toBeGreaterThan(0);
      expect(res.recommended.netProfit).toBeDefined();
      expect(typeof res.recommended.summary).toBe('string');
      expect(res.recommended.summary).toContain('Відкрити');
      expect(res.recommended.summary).toContain('груп');
      expect(res.recommended.summary).toContain('кімнат');

      // Секція 2: strategies (3 моделі: MAX_PROFIT, COMFORT_QUALITY, MINIMAL_INFRASTRUCTURE)
      expect(res.strategies.maxProfit.strategyCode).toBe('MAX_PROFIT');
      expect(res.strategies.comfortQuality.strategyCode).toBe('COMFORT_QUALITY');
      expect(res.strategies.minimalInfrastructure.strategyCode).toBe('MINIMAL_INFRASTRUCTURE');
      expect(res.strategies.minimalInfrastructure.title).toContain('Мінімум інфраструктури');
      expect(res.strategies.minimalInfrastructure.description).toContain('20 дітей');
      expect(res.strategies.minimalInfrastructure.profitDifference).toBeDefined();

      // Секція 3: marginalEconomics (marginalChild, clubTeachersStatus, expansionAnalysis)
      expect(res.marginalEconomics.marginalChild).toBeDefined();
      expect(res.marginalEconomics.marginalChild.childNumber).toBe(
        res.recommended.totalAdmitted + 1
      );
      expect(res.marginalEconomics.marginalChild.insight).toMatch(
        /Дитина №\d+ приносить [+-]?[\d\s]+ грн\/міс чистого прибутку\./
      );

      expect(res.marginalEconomics.clubTeachersStatus.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(res.marginalEconomics.clubTeachersStatus.insight).toMatch(
        /Поточний штат гуртків заповнений на \d+% \(\d+ з \d+ груп\)\./
      );

      expect(res.marginalEconomics.expansionAnalysis).toBeDefined();
      expect(res.marginalEconomics.expansionAnalysis.costJump).toBeGreaterThan(0);
      expect(res.marginalEconomics.expansionAnalysis.insight).toMatch(
        /Відкриття наступної групи вимагатиме стрибка витрат на \+[\d\s]+ грн\./
      );
    });

    test('expansionAnalysis: відкриття першої групи створює стрибок витрат на 270 000 грн (кімната + асистент + 5 вчителів гуртків)', () => {
      const res = optimizeKindergartenCapacity({ 2: 0, 3: 0, 4: 0, 5: 0 });
      // 50 000 оренда + 20 000 асистент + 200 000 (5 * 40 000 гуртки) = 270 000 грн (27 000 000 коп)
      expect(res.marginalEconomics.expansionAnalysis.costJump).toBe(27000000);
      expect(res.marginalEconomics.expansionAnalysis.triggersNewClubSet).toBe(true);
      expect(res.marginalEconomics.expansionAnalysis.breakdown).toEqual({
        roomCost: 5000000,
        assistantBase: 2000000,
        clubTeachersCost: 20000000,
      });
      expect(res.marginalEconomics.expansionAnalysis.insight).toContain('270 000 грн');
    });

    test('marginalChild: коли досягнуто максимальної місткості 300 дітей', () => {
      // 300 дітей: 15 груп по 20 дітей (4+4+4+3 кімнати)
      const demand = { 2: 80, 3: 80, 4: 80, 5: 60 };
      const res = optimizeKindergartenCapacity(demand);

      expect(res.recommended.totalAdmitted).toBe(300);
      expect(res.marginalEconomics.marginalChild.childNumber).toBe(301);
      expect(res.marginalEconomics.marginalChild.marginalIncome).toBe(0);
      expect(res.marginalEconomics.marginalChild.marginalCost).toBe(0);
      expect(res.marginalEconomics.marginalChild.marginalProfit).toBe(0);
      expect(res.marginalEconomics.marginalChild.insight).toContain(
        'Досягнуто максимальної місткості садка (300 дітей). Прийом нових дітей неможливий.'
      );
    });

    test('marginalChild: коли всі відкриті групи заповнені (по 20 дітей), але є вільні кімнати', () => {
      // 1 відкрита група на 20 дітей при порозі 20 (щоб оптимум обрав саме 1 групу)
      const demand = { 2: 20, 3: 0, 4: 0, 5: 0 };
      const res = optimizeKindergartenCapacity(demand, { threshold: 20 });

      expect(res.recommended.totalAdmitted).toBe(20);
      expect(res.recommended.groupsCount).toBe(1);
      // Дитина №21 вимагатиме відкриття 2-ї групи (постійні витрати на асистента 20 000 грн)
      expect(res.marginalEconomics.marginalChild.childNumber).toBe(21);
      expect(res.marginalEconomics.marginalChild.marginalCost).toBeGreaterThan(200000); // більше ніж просто 2 000 грн вихователю
    });

    test('clubTeachersStatus: попередження при 100% завантаженні комплекту викладачів (15 груп)', () => {
      // 15 груп по 20 дітей = 300 дітей
      const demand = { 2: 75, 3: 75, 4: 75, 5: 75 };
      const res = optimizeKindergartenCapacity(demand);

      if (res.recommended.groupsCount === 15) {
        expect(res.marginalEconomics.clubTeachersStatus.freeGroupCapacity).toBe(0);
        expect(res.marginalEconomics.clubTeachersStatus.warning).toContain(
          'Викладачі гуртків завантажені на 100%'
        );
      }
    });

    test('expansionAnalysis: коли всі групові кімнати вичерпано (freeRooms === 0)', () => {
      const demand = { 2: 75, 3: 75, 4: 75, 5: 75 }; // 300 дітей, 15 груп зайнято
      const res = optimizeKindergartenCapacity(demand);

      expect(res.recommended.groupsCount).toBe(15);
      expect(res.marginalEconomics.expansionAnalysis.canExpand).toBe(false);
      expect(res.marginalEconomics.expansionAnalysis.insight).toContain(
        'Досягнуто ліміту приміщень'
      );
    });

    test('waitlistAdvice: конкуренція за вільні слоти викладачів гуртків (hasClubCompetition)', () => {
      // totalRoomsCount = 20, але слотів у викладачів гуртків менше ніж вікових категорій з чергою
      // Наприклад, 12 груп відкрито, вільний лише 1 слот гуртків (13 - 12 = 1), а черга є у 2 вікових категоріях
      const res = optimizeKindergartenCapacity(
        { 2: 60, 3: 60, 4: 65, 5: 65 },
        { maxGroupRooms: 15 }
      );

      expect(res.marginalEconomics.waitlistAdvice).toBeInstanceOf(Array);
    });
  });

  describe('Нові покращення та валідації (Issues 1.1, 2.4, 3.1)', () => {
    test('distributeChildrenOptimally: викидає BadRequestError якщо admitted > g * capPerGroup (Issue 3.1)', () => {
      expect(() => distributeChildrenOptimally(41, 2, 12, 20)).toThrow(BadRequestError);
      expect(() => distributeChildrenOptimally(41, 2, 12, 20)).toThrow(
        /exceeds total capacity of 2 groups/i
      );
    });

    test('normalizeAgeDemand: додає попередження, якщо передано і targetChildrenCount, і віковий ключ (Issue 2.4)', () => {
      const res = optimizeKindergartenCapacity({
        targetChildrenCount: 100,
        2: 15,
      });

      expect(res.requestedDemand.warning).toContain(
        'Параметр targetChildrenCount було проігноровано'
      );
      expect(res.requestedDemand[2]).toBe(15);
      expect(res.requestedDemand.totalChildren).toBe(15);
    });

    test('evaluateConfiguration та optimizeKindergartenCapacity: коректно використовують окремий assistantExtra (Issue 1.1)', () => {
      // extraPay вихователя = 300 000 (3 000 грн), а assistantExtra = 150 000 (1 500 грн)
      const res = evaluateConfiguration(
        { 2: 1 },
        { 2: 14, 3: 0, 4: 0, 5: 0 },
        {
          extraPay: 300000,
          assistantExtra: 150000,
          threshold: 12,
        }
      );

      // Група з 14 дітей має 2 дітей понад поріг 12:
      // Вихователь: 14 * 2 000 + 2 * 3 000 = 34 000 грн (3 400 000 коп)
      expect(res.totalEducatorsSalary).toBe(3400000);
      // Помічник: 20 000 + 2 * 1 500 = 23 000 грн (2 300 000 коп)
      expect(res.totalAssistantsSalary).toBe(2300000);
    });

    test('дефолтні параметри функцій validateOptions, normalizeAgeDemand та evaluateConfiguration', () => {
      expect(() => validateOptions()).not.toThrow();
      expect(normalizeAgeDemand()).toEqual({ 2: 0, 3: 0, 4: 0, 5: 0 });
      const cfg = evaluateConfiguration({ 2: 1 }, { 2: 10, 3: 0, 4: 0, 5: 0 });
      expect(cfg.totalGroups).toBe(1);
    });

    test('normalizeAgeDemand: перевірка залишку r = 3 (targetChildrenCount = 7)', () => {
      const res = normalizeAgeDemand({ targetChildrenCount: 7 });
      expect(res).toEqual({ 2: 2, 3: 2, 4: 2, 5: 1 });
    });

    test('optimizeKindergartenCapacity: попередження про targetChildrenCount при нульовому попиті', () => {
      const res = optimizeKindergartenCapacity({ targetChildrenCount: 0, 2: 0, 3: 0 });
      expect(res.requestedDemand.warning).toBeDefined();
      expect(res.recommended.groupsCount).toBe(0);
    });

    test('waitlistAdvice: чітке формування competitionNote для конкуренції за кімнати та слоти', () => {
      // 1 вільна групова кімната на 2 вікові групи з відхиленими дітьми
      const resRoom = optimizeKindergartenCapacity(
        { 2: 1, 3: 1, 4: 0, 5: 0 },
        { totalRoomsCount: 6, clubRoomsCount: 5 }
      );
      const adviceRoom = resRoom.marginalEconomics.waitlistAdvice.find((a) => a.competitionWarning);
      expect(adviceRoom).toBeDefined();
      expect(adviceRoom.competitionWarning).toContain('вільних групових кімнат');

      // Конкуренція за слоти гуртків
      const resClub = optimizeKindergartenCapacity(
        { 2: 20 * 7, 3: 20 * 7, 4: 1, 5: 1 }, // 14 груп (залишився 1 слот гуртка на 2 вікові групи при місткості 15)
        { totalRoomsCount: 20, clubRoomsCount: 5 }
      );
      const adviceClub = resClub.marginalEconomics.waitlistAdvice.find(
        (a) => a.competitionWarning && a.competitionWarning.includes('слотів')
      );
      if (adviceClub) {
        expect(adviceClub.competitionWarning).toContain('вільних слотів');
      }
    });

    test('waitlistAdvice: випадок breakEvenChildren === null при неможливості беззбитковості', () => {
      const res = optimizeKindergartenCapacity(
        { 2: 1, 3: 0, 4: 0, 5: 0 },
        {
          tuition: 100, // мізерна вартість
          ratePerChild: 10000000, // астрономічна ставка
          assistantBase: 50000000,
        }
      );
      const advice = res.marginalEconomics.waitlistAdvice.find((a) => a.age === 2);
      expect(advice).toBeDefined();
      expect(advice.breakEvenChildrenCount).toBeNull();
      expect(advice.reason).toContain('не виходить на беззбитковість');
    });
  });
});
