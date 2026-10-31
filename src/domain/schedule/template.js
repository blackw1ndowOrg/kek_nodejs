// Шаблон дня однаковий для всіх груп: 08:30–16:30 (8 годин).
// Час — у хвилинах від півночі, як у моделі ScheduleSlot.

const ACTIVITY = Object.freeze({
  MEAL: 'MEAL',
  FREE_PLAY: 'FREE_PLAY',
  CLUB: 'CLUB',
  WALK: 'WALK',
  SLEEP: 'SLEEP',
});

/** Понеділок–п'ятниця */
const DAYS = Object.freeze([1, 2, 3, 4, 5]);

const DAY_START = 8 * 60 + 30;

// [активність, тривалість у хвилинах]
const DAY_PLAN = Object.freeze([
  [ACTIVITY.MEAL, 30], // сніданок
  [ACTIVITY.CLUB, 45], // заняття 1
  [ACTIVITY.FREE_PLAY, 15],
  [ACTIVITY.CLUB, 45], // заняття 2
  [ACTIVITY.FREE_PLAY, 15],
  [ACTIVITY.WALK, 60], // прогулянка
  [ACTIVITY.MEAL, 30], // обід
  [ACTIVITY.FREE_PLAY, 30],
  [ACTIVITY.SLEEP, 60], // денний сон
  [ACTIVITY.CLUB, 45], // заняття 3
  [ACTIVITY.FREE_PLAY, 15],
  [ACTIVITY.MEAL, 30], // підвечірок
  [ACTIVITY.FREE_PLAY, 60],
]);

function buildDayTemplate(start, plan) {
  let cursor = start;
  return plan.map(([activity, minutes]) => {
    const slot = Object.freeze({ startMinute: cursor, endMinute: cursor + minutes, activity });
    cursor += minutes;
    return slot;
  });
}

const DAY_TEMPLATE = Object.freeze(buildDayTemplate(DAY_START, DAY_PLAN));
const DAY_END = DAY_TEMPLATE[DAY_TEMPLATE.length - 1].endMinute;
const LESSONS_PER_DAY = DAY_TEMPLATE.filter((slot) => slot.activity === ACTIVITY.CLUB).length;

module.exports = { ACTIVITY, DAYS, DAY_START, DAY_END, DAY_TEMPLATE, LESSONS_PER_DAY };
