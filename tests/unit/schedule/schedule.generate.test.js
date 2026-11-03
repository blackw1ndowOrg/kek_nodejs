const {
  ACTIVITY,
  DAYS,
  DAY_START,
  DAY_END,
  generateSchedule,
  maxGroupsFor,
  ScheduleCapacityError,
  validateSchedule,
} = require('../../../src/domain/schedule');

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

const dayOf = (slots, groupId, dayOfWeek) =>
  slots
    .filter((s) => s.groupId === groupId && s.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startMinute - b.startMinute);

const countOf = (day, activity) => day.filter((s) => s.activity === activity).length;

/** День групи: 14 слотів поспіль без накладок; 3 заняття, 2 прогулянки, 5 вільної гри, 3 їжі, сон */
function expectValidDay(day) {
  expect(day).toHaveLength(14);
  expect(day[0].startMinute).toBe(DAY_START);
  expect(day[day.length - 1].endMinute).toBe(DAY_END);
  for (let i = 1; i < day.length; i += 1) {
    expect(day[i].startMinute).toBeGreaterThanOrEqual(day[i - 1].endMinute);
  }
  expect(countOf(day, ACTIVITY.CLUB)).toBe(3);
  expect(countOf(day, ACTIVITY.WALK)).toBe(2);
  expect(countOf(day, ACTIVITY.FREE_PLAY)).toBe(5);
  expect(countOf(day, ACTIVITY.MEAL)).toBe(3);
  expect(countOf(day, ACTIVITY.SLEEP)).toBe(1);

  const clubIds = day.filter((s) => s.activity === ACTIVITY.CLUB).map((s) => s.clubId);
  expect(new Set(clubIds).size).toBe(3);
  expect(day.filter((s) => s.activity !== ACTIVITY.CLUB).every((s) => s.clubId === null)).toBe(
    true
  );

  const walks = day.filter((s) => s.activity === ACTIVITY.WALK);
  expect(walks[1].startMinute - walks[0].startMinute).toBe(45); // година прогулянки поспіль
}

/** Ключі унікальних індексів БД: (group, day, start) і (club, day, start) */
function expectUniqueDbKeys(slots) {
  const groupKeys = new Set();
  const clubKeys = new Set();
  for (const s of slots) {
    groupKeys.add(`${s.groupId}:${s.dayOfWeek}:${s.startMinute}`);
    if (s.clubId !== null) clubKeys.add(`${s.clubId}:${s.dayOfWeek}:${s.startMinute}`);
  }
  expect(groupKeys.size).toBe(slots.length);
  expect(clubKeys.size).toBe(slots.filter((s) => s.clubId !== null).length);
}

describe('generateSchedule', () => {
  test('без груп повертає порожній розклад (навіть без гуртків)', () => {
    expect(generateSchedule({ groups: [], clubs: [] })).toEqual([]);
    expect(generateSchedule({ groups: [], clubs: ids(5) })).toEqual([]);
  });

  describe('обмеження місткості', () => {
    test('гуртків менше трьох -> ScheduleCapacityError', () => {
      const run = () => generateSchedule({ groups: ids(1), clubs: ids(2) });
      expect(run).toThrow(ScheduleCapacityError);
      expect(run).toThrow('щонайменше 3 гуртки, зараз їх 2');
    });

    test('maxGroupsFor: 3 групи на кожен гурток', () => {
      expect(maxGroupsFor(3)).toBe(9);
      expect(maxGroupsFor(5)).toBe(15);
    });

    test('15 груп і 5 гуртків вміщаються, 16 груп — ні', () => {
      expect(() => generateSchedule({ groups: ids(15), clubs: ids(5) })).not.toThrow();
      const run = () => generateSchedule({ groups: ids(16), clubs: ids(5) });
      expect(run).toThrow(ScheduleCapacityError);
      expect(run).toThrow('Груп (16) більше, ніж можна розвести за часом');
      expect(run).toThrow('щонайбільше 15 груп');
    });

    test('помилка має ім’я ScheduleCapacityError й є Error', () => {
      const error = new ScheduleCapacityError('x');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ScheduleCapacityError');
      expect(error.message).toBe('x');
    });
  });

  describe('одна група', () => {
    const slots = generateSchedule({ groups: ids(1), clubs: ids(5, 11) });

    test('14 слотів на день, 70 на тиждень', () => {
      expect(slots).toHaveLength(14 * 5);
      expect(DAYS.every((day) => dayOf(slots, 1, day).length === 14)).toBe(true);
    });

    test.each(DAYS)('день %i: коректна структура', (day) => {
      expectValidDay(dayOf(slots, 1, day));
    });

    test('слоти мають усі поля моделі ScheduleSlot', () => {
      for (const s of slots) {
        expect(Object.keys(s).sort()).toEqual(
          ['activity', 'clubId', 'dayOfWeek', 'endMinute', 'groupId', 'startMinute'].sort()
        );
      }
    });

    test('розклад без конфліктів', () => {
      expect(validateSchedule(slots)).toEqual([]);
    });

    test('заняття першої групи в понеділок: 09:00, 09:45, 10:30 (перша трійка слотів)', () => {
      const lessons = dayOf(slots, 1, 1).filter((s) => s.activity === ACTIVITY.CLUB);
      expect(lessons.map((s) => s.startMinute)).toEqual([540, 585, 630]);
      expect(lessons.map((s) => s.clubId)).toEqual([11, 12, 13]);
    });

    test('трійка слотів із заняттями змінюється з днем тижня', () => {
      const firstLessonStart = DAYS.map(
        (day) => dayOf(slots, 1, day).find((s) => s.activity === ACTIVITY.CLUB).startMinute
      );
      expect(firstLessonStart).toEqual([540, 675, 930, 540, 675]);
    });
  });

  describe('рівномірність за тиждень', () => {
    const weeklyCounts = (slots, groupId, clubs) => {
      const counts = Object.fromEntries(clubs.map((c) => [c.id, 0]));
      slots
        .filter((s) => s.groupId === groupId && s.clubId !== null)
        .forEach((s) => {
          counts[s.clubId] += 1;
        });
      return Object.values(counts);
    };

    test('5 гуртків: кожен гурток у кожної групи рівно 3 рази на тиждень', () => {
      const groups = ids(15);
      const clubs = ids(5, 11);
      const slots = generateSchedule({ groups, clubs });
      for (const group of groups) {
        expect(weeklyCounts(slots, group.id, clubs)).toEqual([3, 3, 3, 3, 3]);
      }
    });

    test.each([3, 4, 6, 7, 8])('%i гуртків: 15 занять розподілені з різницею не більше 1', (c) => {
      const groups = ids(Math.min(3 * c, 10));
      const clubs = ids(c, 50);
      const slots = generateSchedule({ groups, clubs });
      for (const group of groups) {
        const counts = weeklyCounts(slots, group.id, clubs);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(15);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('15 груп і 5 гуртків: повне завантаження', () => {
    const groups = ids(15);
    const clubs = ids(5, 11);
    const slots = generateSchedule({ groups, clubs });

    test('1050 слотів і жодного конфлікту', () => {
      expect(slots).toHaveLength(15 * 5 * 14);
      expect(validateSchedule(slots)).toEqual([]);
      expectUniqueDbKeys(slots);
    });

    test('кожен гурток веде рівно 9 занять на день (усі 9 слотів зайняті)', () => {
      for (const club of clubs) {
        for (const day of DAYS) {
          const lessons = slots.filter((s) => s.clubId === club.id && s.dayOfWeek === day);
          expect(lessons).toHaveLength(9);
          expect(new Set(lessons.map((s) => s.startMinute)).size).toBe(9);
        }
      }
    });

    test('у кожної групи на кожен день коректна структура', () => {
      for (const group of groups) {
        for (const day of DAYS) expectValidDay(dayOf(slots, group.id, day));
      }
    });
  });

  describe('усі допустимі комбінації груп і гуртків', () => {
    test.each([3, 4, 5, 6, 7, 8])('%i гуртків: від 1 групи до максимуму без колізій', (c) => {
      const clubs = ids(c, 100);
      for (let g = 1; g <= maxGroupsFor(c); g += 1) {
        const groups = ids(g, 7);
        const slots = generateSchedule({ groups, clubs });
        expect(validateSchedule(slots)).toEqual([]);
        expectUniqueDbKeys(slots);
        for (const group of groups) {
          for (const day of DAYS) expectValidDay(dayOf(slots, group.id, day));
        }
        const perClubDay = new Map();
        for (const s of slots.filter((x) => x.clubId !== null)) {
          const key = `${s.clubId}:${s.dayOfWeek}`;
          perClubDay.set(key, (perClubDay.get(key) ?? 0) + 1);
        }
        expect(Math.max(...perClubDay.values())).toBeLessThanOrEqual(9);
      }
    });
  });

  describe('детермінованість', () => {
    test('однаковий вхід -> однаковий розклад', () => {
      const input = { groups: ids(7), clubs: ids(5, 11) };
      expect(generateSchedule(input)).toEqual(generateSchedule(input));
    });

    test('порядок груп і гуртків на вході не впливає на результат, вхід не мутується', () => {
      const groups = [{ id: 3 }, { id: 1 }, { id: 2 }];
      const clubs = [{ id: 14 }, { id: 12 }, { id: 11 }, { id: 13 }];
      const sortedResult = generateSchedule({
        groups: [{ id: 1 }, { id: 2 }, { id: 3 }],
        clubs: [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }],
      });
      expect(generateSchedule({ groups, clubs })).toEqual(sortedResult);
      expect(groups.map((g) => g.id)).toEqual([3, 1, 2]);
      expect(clubs.map((c) => c.id)).toEqual([14, 12, 11, 13]);
    });

    test('використовує справжні id груп і гуртків, а не їхні індекси', () => {
      const groups = [{ id: 40 }, { id: 90 }];
      const clubs = [{ id: 7 }, { id: 21 }, { id: 35 }];
      const slots = generateSchedule({ groups, clubs });
      expect([...new Set(slots.map((s) => s.groupId))].sort((a, b) => a - b)).toEqual([40, 90]);
      const used = new Set(slots.filter((s) => s.clubId !== null).map((s) => s.clubId));
      expect([...used].sort((a, b) => a - b)).toEqual([7, 21, 35]);
    });
  });
});
