// Шаблон дня садка: 08:30–18:00. Час — у хвилинах від півночі, як у моделі ScheduleSlot.
//
//   08:30–09:00  сніданок
//   09:00–12:00  4 слоти по 30 хв (заняття / прогулянка / вільна гра)
//   12:00–12:30  обід
//   12:30–13:00  вільна гра
//   13:00–14:00  сон
//   14:00–17:45  5 слотів по 30 хв (заняття / прогулянка / вільна гра)
//   17:30–18:00  вечеря
//
// Слоти йдуть із перервою 15 хв (45 хв на слот разом із перервою; перерви в БД не зберігаються).
// Усього 9 слотів на день. Кожна група на день: 3 заняття, 2 слоти прогулянки (= 1 година),
// решта слотів — вільна гра. Викладач (гурток) може вести до 9 занять на день.

const ACTIVITY = Object.freeze({
  MEAL: 'MEAL',
  FREE_PLAY: 'FREE_PLAY',
  CLUB: 'CLUB',
  WALK: 'WALK',
  SLEEP: 'SLEEP',
});

/** Понеділок–п'ятниця */
const DAYS = Object.freeze([1, 2, 3, 4, 5]);

const SLOT_MINUTES = 30;
const BREAK_MINUTES = 15;
const WALK_SLOTS = 2; // 2 × 30 хв = 1 година прогулянки
const LESSONS_PER_DAY = 3;

const at = (hours, minutes = 0) => hours * 60 + minutes;

const fixedSlot = (activity, startMinute, endMinute) =>
  Object.freeze({ startMinute, endMinute, activity });

function buildBlock(start, count) {
  return Object.freeze(
    Array.from({ length: count }, (_, i) => {
      const startMinute = start + i * (SLOT_MINUTES + BREAK_MINUTES);
      return Object.freeze({ startMinute, endMinute: startMinute + SLOT_MINUTES });
    })
  );
}

// Періоди, у які можливі заняття гуртків (з таблиці розкладу): 4 і 5 слотів по 45 хв
const MORNING_WINDOW = Object.freeze({ start: at(9), end: at(12) });
const AFTERNOON_WINDOW = Object.freeze({ start: at(14), end: at(17, 45) });
const LESSON_WINDOWS = Object.freeze([MORNING_WINDOW, AFTERNOON_WINDOW]);

const MORNING_SLOTS = buildBlock(MORNING_WINDOW.start, 4);
const AFTERNOON_SLOTS = buildBlock(AFTERNOON_WINDOW.start, 5);
/** Усі 9 слотів дня в хронологічному порядку */
const LESSON_SLOTS = Object.freeze([...MORNING_SLOTS, ...AFTERNOON_SLOTS]);
const TEACHER_SLOTS_PER_DAY = LESSON_SLOTS.length; // 9

/** На скільки груп без накладок за часом можна розвести 9 слотів (по 3 заняття на групу) */
const MAX_WAVES = Math.floor(TEACHER_SLOTS_PER_DAY / LESSONS_PER_DAY);

const BREAKFAST = fixedSlot(ACTIVITY.MEAL, at(8, 30), at(9));
const LUNCH = fixedSlot(ACTIVITY.MEAL, at(12), at(12, 30));
const MIDDAY_PLAY = fixedSlot(ACTIVITY.FREE_PLAY, at(12, 30), at(13));
const SLEEP = fixedSlot(ACTIVITY.SLEEP, at(13), at(14));
const DINNER = fixedSlot(ACTIVITY.MEAL, at(17, 30), at(18));

const DAY_START = BREAKFAST.startMinute;
const DAY_END = DINNER.endMinute;

module.exports = {
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
};
