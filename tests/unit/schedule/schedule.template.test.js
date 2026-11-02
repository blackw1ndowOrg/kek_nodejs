const {
  ACTIVITY,
  DAYS,
  DAY_START,
  DAY_END,
  BREAKFAST,
  LUNCH,
  MIDDAY_PLAY,
  SLEEP,
  DINNER,
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  LESSON_SLOTS,
  LESSON_WINDOWS,
  TEACHER_SLOTS_PER_DAY,
  WALK_SLOTS,
  LESSONS_PER_DAY,
  MAX_WAVES,
} = require('../../../src/domain/schedule');

const SLOT_MINUTES = 30;
const BREAK_MINUTES = 15;

describe('шаблон дня садка', () => {
  test('дні — понеділок–п’ятниця, активності незмінні', () => {
    expect(DAYS).toEqual([1, 2, 3, 4, 5]);
    expect(Object.keys(ACTIVITY).sort()).toEqual(['CLUB', 'FREE_PLAY', 'MEAL', 'SLEEP', 'WALK']);
    expect(Object.isFrozen(ACTIVITY)).toBe(true);
    expect(Object.isFrozen(DAYS)).toBe(true);
  });

  test('день триває з 08:30 до 18:00', () => {
    expect(DAY_START).toBe(8 * 60 + 30);
    expect(DAY_END).toBe(18 * 60);
  });

  describe('ранкові слоти (09:00–12:00)', () => {
    test('4 слоти по 30 хв: 09:00, 09:45, 10:30, 11:15', () => {
      expect(MORNING_SLOTS.map((s) => s.startMinute)).toEqual([540, 585, 630, 675]);
      expect(MORNING_SLOTS.every((s) => s.endMinute - s.startMinute === SLOT_MINUTES)).toBe(true);
    });

    test('між слотами перерва 15 хв', () => {
      for (let i = 1; i < MORNING_SLOTS.length; i += 1) {
        expect(MORNING_SLOTS[i].startMinute - MORNING_SLOTS[i - 1].endMinute).toBe(BREAK_MINUTES);
      }
    });
  });

  describe('слоти після обіду (14:00–17:45)', () => {
    test('5 слотів по 30 хв: 14:00, 14:45, 15:30, 16:15, 17:00', () => {
      expect(AFTERNOON_SLOTS.map((s) => s.startMinute)).toEqual([840, 885, 930, 975, 1020]);
      expect(AFTERNOON_SLOTS.every((s) => s.endMinute - s.startMinute === SLOT_MINUTES)).toBe(
        true
      );
    });

    test('між слотами перерва 15 хв, останній слот закінчується о 17:30', () => {
      for (let i = 1; i < AFTERNOON_SLOTS.length; i += 1) {
        expect(AFTERNOON_SLOTS[i].startMinute - AFTERNOON_SLOTS[i - 1].endMinute).toBe(
          BREAK_MINUTES
        );
      }
      expect(AFTERNOON_SLOTS[4].endMinute).toBe(17 * 60 + 30);
    });
  });

  test('усього 9 слотів для занять, у хронологічному порядку', () => {
    expect(LESSON_SLOTS).toHaveLength(9);
    expect(TEACHER_SLOTS_PER_DAY).toBe(9);
    expect(LESSON_SLOTS).toEqual([...MORNING_SLOTS, ...AFTERNOON_SLOTS]);
    for (let i = 1; i < LESSON_SLOTS.length; i += 1) {
      expect(LESSON_SLOTS[i].startMinute).toBeGreaterThan(LESSON_SLOTS[i - 1].endMinute);
    }
  });

  test('періоди занять: 09:00–12:00 та 14:00–17:45, усі слоти всередині них', () => {
    expect(LESSON_WINDOWS).toEqual([
      { start: 540, end: 720 },
      { start: 840, end: 1065 },
    ]);
    const inside = (slot, window) => slot.startMinute >= window.start && slot.endMinute <= window.end;
    expect(MORNING_SLOTS.every((s) => inside(s, LESSON_WINDOWS[0]))).toBe(true);
    expect(AFTERNOON_SLOTS.every((s) => inside(s, LESSON_WINDOWS[1]))).toBe(true);
  });

  test('3 заняття на день, година прогулянки (2 слоти), 3 «хвилі» по 3 слоти', () => {
    expect(LESSONS_PER_DAY).toBe(3);
    expect(WALK_SLOTS * SLOT_MINUTES).toBe(60);
    expect(MAX_WAVES).toBe(3);
    expect(MAX_WAVES * LESSONS_PER_DAY).toBe(TEACHER_SLOTS_PER_DAY);
  });

  describe('фіксовані слоти', () => {
    test('3 прийоми їжі по 30 хв, не підряд', () => {
      const meals = [BREAKFAST, LUNCH, DINNER];
      expect(meals.every((m) => m.activity === ACTIVITY.MEAL)).toBe(true);
      expect(meals.every((m) => m.endMinute - m.startMinute === 30)).toBe(true);
      expect(LUNCH.startMinute).toBeGreaterThan(BREAKFAST.endMinute);
      expect(DINNER.startMinute).toBeGreaterThan(LUNCH.endMinute);
    });

    test('сон — одна година 13:00–14:00, вільна гра 12:30–13:00', () => {
      expect(SLEEP).toEqual({ activity: ACTIVITY.SLEEP, startMinute: 780, endMinute: 840 });
      expect(MIDDAY_PLAY).toEqual({
        activity: ACTIVITY.FREE_PLAY,
        startMinute: 750,
        endMinute: 780,
      });
    });

    test('слоти заморожені', () => {
      expect([BREAKFAST, LUNCH, MIDDAY_PLAY, SLEEP, DINNER].every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(LESSON_SLOTS)).toBe(true);
      expect(MORNING_SLOTS.every(Object.isFrozen)).toBe(true);
    });
  });

  test('фіксовані слоти й слоти занять разом не перетинаються й вкладаються в день', () => {
    const all = [BREAKFAST, LUNCH, MIDDAY_PLAY, SLEEP, DINNER, ...LESSON_SLOTS].sort(
      (a, b) => a.startMinute - b.startMinute
    );
    expect(all[0].startMinute).toBe(DAY_START);
    expect(all[all.length - 1].endMinute).toBe(DAY_END);
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i].startMinute).toBeGreaterThanOrEqual(all[i - 1].endMinute);
    }
  });
});
