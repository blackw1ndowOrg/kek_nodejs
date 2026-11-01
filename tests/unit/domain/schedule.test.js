const {
  ACTIVITY,
  DAYS,
  DAY_START,
  DAY_END,
  DAY_TEMPLATE,
  LESSONS_PER_DAY,
  generateSchedule,
  ScheduleCapacityError,
  validateSchedule,
  CONFLICT,
} = require('../../../src/domain/schedule');

const makeGroups = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const makeClubs = (n) => Array.from({ length: n }, (_, i) => ({ id: 11 + i }));

const slot = (overrides = {}) => ({
  groupId: 1,
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 585,
  activity: 'CLUB',
  clubId: 11,
  ...overrides,
});

const minutes = (activity) =>
  DAY_TEMPLATE.filter((item) => item.activity === activity).map(
    (item) => item.endMinute - item.startMinute
  );

describe('шаблон дня', () => {
  test('день триває 8 годин: 08:30–16:30', () => {
    expect(DAY_START).toBe(8 * 60 + 30);
    expect(DAY_END).toBe(16 * 60 + 30);
    expect(DAY_END - DAY_START).toBe(480);
  });

  test('понеділок–п’ятниця', () => {
    expect(DAYS).toEqual([1, 2, 3, 4, 5]);
  });

  test('слоти йдуть упритул без прогалин і накладок', () => {
    expect(DAY_TEMPLATE[0].startMinute).toBe(DAY_START);
    for (let i = 1; i < DAY_TEMPLATE.length; i += 1) {
      expect(DAY_TEMPLATE[i].startMinute).toBe(DAY_TEMPLATE[i - 1].endMinute);
    }
  });

  test('три прийоми їжі по 30 хв, жодні два не йдуть підряд', () => {
    expect(minutes(ACTIVITY.MEAL)).toEqual([30, 30, 30]);
    DAY_TEMPLATE.forEach((item, i) => {
      if (item.activity === ACTIVITY.MEAL && DAY_TEMPLATE[i + 1]) {
        expect(DAY_TEMPLATE[i + 1].activity).not.toBe(ACTIVITY.MEAL);
      }
    });
  });

  test('сон і прогулянка по 1 годині, три заняття по 45 хвилин', () => {
    expect(minutes(ACTIVITY.SLEEP)).toEqual([60]);
    expect(minutes(ACTIVITY.WALK)).toEqual([60]);
    expect(minutes(ACTIVITY.CLUB)).toEqual([45, 45, 45]);
    expect(LESSONS_PER_DAY).toBe(3);
  });

  test('на вільний час лишається 135 хвилин', () => {
    expect(minutes(ACTIVITY.FREE_PLAY).reduce((sum, value) => sum + value, 0)).toBe(135);
  });

  test('шаблон заморожений', () => {
    expect(Object.isFrozen(DAY_TEMPLATE)).toBe(true);
    expect(Object.isFrozen(DAY_TEMPLATE[0])).toBe(true);
  });
});

describe('generateSchedule', () => {
  test('без груп розкладу немає', () => {
    expect(generateSchedule({ groups: [], clubs: makeClubs(5) })).toEqual([]);
  });

  test('кожна група отримує повний день на кожен із 5 днів', () => {
    const slots = generateSchedule({ groups: makeGroups(2), clubs: makeClubs(5) });
    expect(slots).toHaveLength(2 * 5 * DAY_TEMPLATE.length);
  });

  test('слоти повторюють шаблон; лише заняття мають clubId', () => {
    const slots = generateSchedule({ groups: makeGroups(1), clubs: makeClubs(5) });
    const monday = slots.filter((item) => item.dayOfWeek === 1);
    expect(monday).toHaveLength(DAY_TEMPLATE.length);
    monday.forEach((item, i) => {
      const template = DAY_TEMPLATE[i];
      expect(item).toMatchObject({
        groupId: 1,
        startMinute: template.startMinute,
        endMinute: template.endMinute,
        activity: template.activity,
      });
      expect(item.clubId === null).toBe(template.activity !== ACTIVITY.CLUB);
    });
  });

  test.each([1, 2, 3, 4, 5])('розклад для %i груп без жодних конфліктів', (count) => {
    const slots = generateSchedule({ groups: makeGroups(count), clubs: makeClubs(5) });
    expect(validateSchedule(slots)).toEqual([]);
  });

  describe('4 групи і 5 гуртків', () => {
    const groups = makeGroups(4);
    const clubs = makeClubs(5);
    const slots = generateSchedule({ groups, clubs });
    const lessonsOf = (groupId) =>
      slots.filter((item) => item.groupId === groupId && item.activity === ACTIVITY.CLUB);

    test.each([1, 2, 3, 4])('група %i: 15 занять, кожен гурток рівно 3 рази', (groupId) => {
      const lessons = lessonsOf(groupId);
      expect(lessons).toHaveLength(15);
      clubs.forEach((club) => {
        expect(lessons.filter((item) => item.clubId === club.id)).toHaveLength(3);
      });
    });

    test.each([1, 2, 3, 4])('група %i: гурток не повторюється в межах дня', (groupId) => {
      DAYS.forEach((day) => {
        const ids = lessonsOf(groupId)
          .filter((item) => item.dayOfWeek === day)
          .map((item) => item.clubId);
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
      });
    });

    test('в один і той самий час жоден гурток не стоїть у двох груп', () => {
      const seen = new Set();
      slots
        .filter((item) => item.clubId !== null)
        .forEach((item) => {
          const key = `${item.dayOfWeek}:${item.startMinute}:${item.clubId}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        });
    });
  });

  test('працює і з більшою кількістю гуртків, ніж груп', () => {
    const slots = generateSchedule({ groups: makeGroups(2), clubs: makeClubs(6) });
    expect(validateSchedule(slots)).toEqual([]);
  });

  test('результат детермінований і не залежить від порядку вхідних даних', () => {
    const first = generateSchedule({ groups: makeGroups(3), clubs: makeClubs(5) });
    const second = generateSchedule({
      groups: [...makeGroups(3)].reverse(),
      clubs: [...makeClubs(5)].reverse(),
    });
    expect(second).toEqual(first);
  });

  test('вхідні масиви не змінюються', () => {
    const groups = [{ id: 2 }, { id: 1 }];
    const clubs = [{ id: 13 }, { id: 11 }, { id: 12 }];
    generateSchedule({ groups, clubs });
    expect(groups).toEqual([{ id: 2 }, { id: 1 }]);
    expect(clubs).toEqual([{ id: 13 }, { id: 11 }, { id: 12 }]);
  });

  test('груп більше, ніж гуртків -> помилка ємності', () => {
    expect(() => generateSchedule({ groups: makeGroups(6), clubs: makeClubs(5) })).toThrow(
      ScheduleCapacityError
    );
    expect(() => generateSchedule({ groups: makeGroups(6), clubs: makeClubs(5) })).toThrow(
      /Груп \(6\) більше, ніж гуртків \(5\)/
    );
  });

  test('гуртків менше, ніж занять на день -> помилка ємності', () => {
    expect(() => generateSchedule({ groups: makeGroups(1), clubs: makeClubs(2) })).toThrow(
      /щонайменше 3 гуртки, зараз їх 2/
    );
  });

  test('ScheduleCapacityError — звичайна помилка з назвою', () => {
    const error = new ScheduleCapacityError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ScheduleCapacityError');
  });
});

describe('validateSchedule', () => {
  test('порожній розклад і розклад без конфліктів', () => {
    expect(validateSchedule([])).toEqual([]);
    expect(validateSchedule([slot(), slot({ groupId: 2, clubId: 12 })])).toEqual([]);
  });

  test('один гурток у двох груп з однаковим початком -> CLUB_DOUBLE_BOOKED', () => {
    const a = slot();
    const b = slot({ groupId: 2 });
    expect(validateSchedule([a, b])).toEqual([
      { type: CONFLICT.CLUB_DOUBLE_BOOKED, dayOfWeek: 1, clubId: 11, slots: [a, b] },
    ]);
  });

  test('перевіряється перетин інтервалів, а не лише однаковий початок', () => {
    const conflicts = validateSchedule([
      slot(),
      slot({ groupId: 2, startMinute: 560, endMinute: 605 }),
    ]);
    expect(conflicts.map((c) => c.type)).toEqual([CONFLICT.CLUB_DOUBLE_BOOKED]);
  });

  test('слоти, що лише торкаються межами, конфліктом не є', () => {
    expect(
      validateSchedule([slot(), slot({ groupId: 2, startMinute: 585, endMinute: 630 })])
    ).toEqual([]);
  });

  test('той самий гурток в інший день — не конфлікт', () => {
    expect(validateSchedule([slot(), slot({ groupId: 2, dayOfWeek: 2 })])).toEqual([]);
  });

  test('у групи два слоти, що перетинаються -> GROUP_OVERLAP', () => {
    const a = slot({ clubId: 11 });
    const b = slot({ clubId: 12, startMinute: 560, endMinute: 600 });
    expect(validateSchedule([a, b])).toEqual([
      { type: CONFLICT.GROUP_OVERLAP, dayOfWeek: 1, groupId: 1, slots: [a, b] },
    ]);
  });

  test('слоти різних груп у різних гуртках не конфліктують', () => {
    expect(validateSchedule([slot({ clubId: 11 }), slot({ groupId: 2, clubId: 12 })])).toEqual([]);
  });

  test('слоти без гуртка не потрапляють у перевірку гуртків', () => {
    const a = slot({ activity: 'WALK', clubId: null });
    const b = slot({ groupId: 2, activity: 'WALK', clubId: undefined });
    expect(validateSchedule([a, b])).toEqual([]);
  });

  test.each([
    ['раніше за початок дня', { startMinute: 480, endMinute: 520 }],
    ['пізніше за кінець дня', { startMinute: 960, endMinute: 1000 }],
  ])('слот %s -> OUT_OF_HOURS', (_name, times) => {
    const item = slot({ ...times, clubId: null });
    expect(validateSchedule([item])).toEqual([
      { type: CONFLICT.OUT_OF_HOURS, dayOfWeek: 1, slots: [item] },
    ]);
  });

  test.each([
    ['кінець дорівнює початку', { startMinute: 560, endMinute: 560 }],
    ['кінець раніше за початок', { startMinute: 600, endMinute: 560 }],
  ])('%s -> INVALID_TIME', (_name, times) => {
    const item = slot({ ...times, clubId: null });
    expect(validateSchedule([item])).toEqual([
      { type: CONFLICT.INVALID_TIME, dayOfWeek: 1, slots: [item] },
    ]);
  });

  test('слот із некоректним часом не дає додаткових накладок', () => {
    const broken = slot({ startMinute: 560, endMinute: 560, clubId: null });
    const valid = slot({ clubId: null });
    expect(validateSchedule([broken, valid]).map((c) => c.type)).toEqual([CONFLICT.INVALID_TIME]);
  });

  test('повертає всі конфлікти одразу', () => {
    const types = validateSchedule([
      slot(),
      slot({ groupId: 2 }),
      slot({ groupId: 3, startMinute: 100, endMinute: 150, clubId: null }),
    ]).map((c) => c.type);
    expect(types).toEqual([CONFLICT.OUT_OF_HOURS, CONFLICT.CLUB_DOUBLE_BOOKED]);
  });
});
