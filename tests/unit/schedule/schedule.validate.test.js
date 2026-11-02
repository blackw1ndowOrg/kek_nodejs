const {
  ACTIVITY,
  CONFLICT,
  generateSchedule,
  validateSchedule,
} = require('../../../src/domain/schedule');

// 09:00–09:30, група 1, понеділок, гурток 1: заняття у валідному періоді
const slot = (overrides = {}) => ({
  id: 1,
  groupId: 1,
  dayOfWeek: 1,
  startMinute: 540,
  endMinute: 570,
  activity: ACTIVITY.CLUB,
  clubId: 1,
  ...overrides,
});

const typesOf = (slots) => validateSchedule(slots).map((c) => c.type);

describe('CONFLICT', () => {
  test('усі типи конфліктів, об’єкт заморожений', () => {
    expect(Object.keys(CONFLICT).sort()).toEqual(
      [
        'CLUB_DOUBLE_BOOKED',
        'CLUB_REPEATED_IN_DAY',
        'GROUP_OVERLAP',
        'INVALID_TIME',
        'LESSON_OUT_OF_WINDOW',
        'OUT_OF_HOURS',
      ].sort()
    );
    expect(Object.isFrozen(CONFLICT)).toBe(true);
  });
});

describe('validateSchedule', () => {
  test('порожній розклад і одне коректне заняття -> без конфліктів', () => {
    expect(validateSchedule([])).toEqual([]);
    expect(validateSchedule([slot()])).toEqual([]);
  });

  test('згенерований розклад не має конфліктів', () => {
    const groups = Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }));
    const clubs = Array.from({ length: 5 }, (_, i) => ({ id: i + 11 }));
    expect(validateSchedule(generateSchedule({ groups, clubs }))).toEqual([]);
  });

  describe('INVALID_TIME', () => {
    test.each([
      ['кінець дорівнює початку', { startMinute: 600, endMinute: 600 }],
      ['кінець раніше за початок', { startMinute: 600, endMinute: 570 }],
    ])('%s', (_name, override) => {
      const bad = slot(override);
      const conflicts = validateSchedule([bad]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ type: CONFLICT.INVALID_TIME, dayOfWeek: 1 });
      expect(conflicts[0].slots[0]).toBe(bad);
    });

    test('некоректний слот не бере участі в інших перевірках', () => {
      expect(typesOf([slot({ startMinute: 600, endMinute: 600 }), slot({ id: 2 })])).toEqual([
        CONFLICT.INVALID_TIME,
      ]);
    });
  });

  describe('OUT_OF_HOURS', () => {
    test.each([
      ['починається до 08:30', { startMinute: 500, endMinute: 520 }],
      ['закінчується після 18:00', { startMinute: 1070, endMinute: 1090 }],
    ])('слот, що %s', (_name, override) => {
      expect(typesOf([slot({ activity: ACTIVITY.MEAL, clubId: null, ...override })])).toEqual([
        CONFLICT.OUT_OF_HOURS,
      ]);
    });

    test('межі дня 08:30 і 18:00 допустимі', () => {
      expect(
        validateSchedule([
          slot({ id: 1, activity: ACTIVITY.MEAL, clubId: null, startMinute: 510, endMinute: 540 }),
          slot({ id: 2, activity: ACTIVITY.MEAL, clubId: null, startMinute: 1050, endMinute: 1080 }),
        ])
      ).toEqual([]);
    });
  });

  describe('LESSON_OUT_OF_WINDOW', () => {
    test.each([
      ['до початку ранкового періоду', { startMinute: 520, endMinute: 550 }],
      ['між ранковим і післяобіднім періодами', { startMinute: 720, endMinute: 750 }],
      ['під час сну', { startMinute: 780, endMinute: 810 }],
      ['після 17:45', { startMinute: 1050, endMinute: 1080 }],
      ['на межі ранкового періоду', { startMinute: 700, endMinute: 730 }],
    ])('заняття %s -> конфлікт', (_name, override) => {
      expect(typesOf([slot(override)])).toContain(CONFLICT.LESSON_OUT_OF_WINDOW);
    });

    test.each([
      ['початок ранкового періоду', { startMinute: 540, endMinute: 570 }],
      ['кінець ранкового періоду', { startMinute: 690, endMinute: 720 }],
      ['початок післяобіднього періоду', { startMinute: 840, endMinute: 870 }],
      ['кінець післяобіднього періоду 17:45', { startMinute: 1035, endMinute: 1065 }],
    ])('заняття на %s -> без конфлікту', (_name, override) => {
      expect(validateSchedule([slot(override)])).toEqual([]);
    });

    test('слот, що не є заняттям, або без активності, періодами не обмежується', () => {
      const nap = slot({ activity: ACTIVITY.SLEEP, clubId: null, startMinute: 780, endMinute: 840 });
      const noActivity = { groupId: 1, dayOfWeek: 1, startMinute: 720, endMinute: 750 };
      expect(validateSchedule([nap, noActivity])).toEqual([]);
    });

    test('у конфлікті — посилання на сам слот і день', () => {
      const bad = slot({ dayOfWeek: 4, startMinute: 720, endMinute: 750 });
      const [conflict] = validateSchedule([bad]);
      expect(conflict).toMatchObject({ type: CONFLICT.LESSON_OUT_OF_WINDOW, dayOfWeek: 4 });
      expect(conflict.slots).toHaveLength(1);
      expect(conflict.slots[0]).toBe(bad);
    });
  });

  describe('GROUP_OVERLAP', () => {
    test('перетин інтервалів із різним початком', () => {
      const a = slot({ id: 1, clubId: 1, startMinute: 540, endMinute: 570 });
      const b = slot({
        id: 2,
        activity: ACTIVITY.WALK,
        clubId: null,
        startMinute: 555,
        endMinute: 585,
      });
      const conflicts = validateSchedule([a, b]);
      expect(conflicts).toEqual([
        { type: CONFLICT.GROUP_OVERLAP, dayOfWeek: 1, groupId: 1, slots: [a, b] },
      ]);
      expect(conflicts[0].slots[0]).toBe(a);
      expect(conflicts[0].slots[1]).toBe(b);
    });

    test('слоти, що стикуються краями, не перетинаються', () => {
      expect(
        validateSchedule([
          slot({ id: 1, clubId: 1, startMinute: 540, endMinute: 570 }),
          slot({ id: 2, clubId: 2, startMinute: 570, endMinute: 600 }),
        ])
      ).toEqual([]);
    });

    test('різні дні або різні групи не конфліктують між собою', () => {
      expect(
        validateSchedule([
          slot({ id: 1, clubId: 1 }),
          slot({ id: 2, clubId: 2, dayOfWeek: 2 }),
          slot({ id: 3, clubId: 3, groupId: 2 }),
        ])
      ).toEqual([]);
    });
  });

  describe('CLUB_DOUBLE_BOOKED', () => {
    test('один гурток у двох груп одночасно', () => {
      const a = slot({ id: 1, groupId: 1, startMinute: 540, endMinute: 570 });
      const b = slot({ id: 2, groupId: 2, startMinute: 555, endMinute: 585 });
      expect(validateSchedule([a, b])).toEqual([
        { type: CONFLICT.CLUB_DOUBLE_BOOKED, dayOfWeek: 1, clubId: 1, slots: [a, b] },
      ]);
    });

    test('стик у стик, різні дні, різні гуртки — без конфлікту', () => {
      expect(
        validateSchedule([
          slot({ id: 1, groupId: 1, startMinute: 540, endMinute: 570 }),
          slot({ id: 2, groupId: 2, startMinute: 570, endMinute: 600 }),
          slot({ id: 3, groupId: 3, dayOfWeek: 2 }),
          slot({ id: 4, groupId: 4, clubId: 2 }),
        ])
      ).toEqual([]);
    });

    test.each([
      ['null', null],
      ['undefined', undefined],
    ])('слоти без гуртка (%s) між собою не конфліктують', (_name, clubId) => {
      const a = { groupId: 1, dayOfWeek: 1, startMinute: 600, endMinute: 630, clubId };
      const b = { groupId: 2, dayOfWeek: 1, startMinute: 600, endMinute: 630, clubId };
      expect(validateSchedule([a, b])).toEqual([]);
    });
  });

  describe('CLUB_REPEATED_IN_DAY', () => {
    test('один гурток двічі за день в однієї групи', () => {
      const a = slot({ id: 1, startMinute: 540, endMinute: 570 });
      const b = slot({ id: 2, startMinute: 840, endMinute: 870 });
      expect(validateSchedule([a, b])).toEqual([
        { type: CONFLICT.CLUB_REPEATED_IN_DAY, dayOfWeek: 1, groupId: 1, clubId: 1, slots: [a, b] },
      ]);
    });

    test('три заняття одного гуртка -> три пари', () => {
      const slots = [540, 585, 630].map((startMinute, i) =>
        slot({ id: i + 1, startMinute, endMinute: startMinute + 30 })
      );
      expect(typesOf(slots)).toEqual([
        CONFLICT.CLUB_REPEATED_IN_DAY,
        CONFLICT.CLUB_REPEATED_IN_DAY,
        CONFLICT.CLUB_REPEATED_IN_DAY,
      ]);
    });

    test('різні дні, різні гуртки або різні групи — без конфлікту', () => {
      expect(
        validateSchedule([
          slot({ id: 1, groupId: 1, clubId: 1, startMinute: 540, endMinute: 570 }),
          slot({ id: 2, groupId: 1, clubId: 1, dayOfWeek: 2, startMinute: 840, endMinute: 870 }),
          slot({ id: 3, groupId: 1, clubId: 2, startMinute: 840, endMinute: 870 }),
          slot({ id: 4, groupId: 2, clubId: 1, startMinute: 840, endMinute: 870 }),
        ])
      ).toEqual([]);
    });

    test('накладене повторне заняття дає всі три конфлікти', () => {
      const types = typesOf([
        slot({ id: 1, startMinute: 540, endMinute: 570 }),
        slot({ id: 2, startMinute: 555, endMinute: 585 }),
      ]);
      expect(types.sort()).toEqual(
        [
          CONFLICT.GROUP_OVERLAP,
          CONFLICT.CLUB_DOUBLE_BOOKED,
          CONFLICT.CLUB_REPEATED_IN_DAY,
        ].sort()
      );
    });
  });

  test('кілька різних конфліктів повертаються разом', () => {
    const types = typesOf([
      slot({ id: 1, startMinute: 720, endMinute: 750 }), // поза періодом
      slot({ id: 2, activity: ACTIVITY.MEAL, clubId: null, startMinute: 400, endMinute: 450 }), // поза днем
      slot({ id: 3, startMinute: 600, endMinute: 600 }), // некоректний час
    ]);
    expect(types.sort()).toEqual(
      [CONFLICT.LESSON_OUT_OF_WINDOW, CONFLICT.OUT_OF_HOURS, CONFLICT.INVALID_TIME].sort()
    );
  });
});
