const {
  ACTIVITY,
  DAYS,
  BREAKFAST,
  LUNCH,
  MIDDAY_PLAY,
  SLEEP,
  DINNER,
  MORNING_SLOTS,
  LESSON_SLOTS,
  WALK_SLOTS,
  LESSONS_PER_DAY,
  MAX_WAVES,
} = require('./template');

class ScheduleCapacityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScheduleCapacityError';
  }
}

const byId = (a, b) => a.id - b.id;

/** Максимум груп, які можна обслужити без накладок кабінетів, при заданій кількості гуртків */
const maxGroupsFor = (clubCount) => clubCount * MAX_WAVES;

/**
 * Перша пара сусідніх слотів (в одному періоді дня), вільних від занять, — під прогулянку.
 * Якщо такої пари нема (недосяжно для шаблону 9 слотів / 3 заняття), беремо перші вільні слоти.
 */
function pickWalkSlots(isLesson) {
  const free = LESSON_SLOTS.map((_, i) => i).filter((i) => !isLesson(i));
  const crossesPeriod = (i) => i + 1 === MORNING_SLOTS.length;
  const start = free.find((i) => !crossesPeriod(i) && free.includes(i + 1));
  const walk = start === undefined ? free.slice(0, WALK_SLOTS) : [start, start + 1];
  return new Set(walk);
}

/**
 * День однієї групи: усі слоти в хронологічному порядку.
 * 9 слотів ділимо на MAX_WAVES = 3 трійки; група обирає одну трійку під заняття
 * (трійка визначається хвилею групи й днем тижня), решта слотів — прогулянка й вільна гра.
 */
function planDay(block) {
  const first = block * LESSONS_PER_DAY;
  const isLesson = (i) => i >= first && i < first + LESSONS_PER_DAY;
  const walk = pickWalkSlots(isLesson);

  const planned = LESSON_SLOTS.map((slot, i) => {
    let activity = ACTIVITY.FREE_PLAY;
    if (isLesson(i)) activity = ACTIVITY.CLUB;
    else if (walk.has(i)) activity = ACTIVITY.WALK;
    return { ...slot, activity };
  });
  return [
    BREAKFAST,
    ...planned.slice(0, MORNING_SLOTS.length),
    LUNCH,
    MIDDAY_PLAY,
    SLEEP,
    ...planned.slice(MORNING_SLOTS.length),
    DINNER,
  ];
}

/**
 * Детермінований генератор тижневого розкладу (без Math.random).
 *
 * Групи діляться на «хвилі» по C груп (C — кількість гуртків). Хвиля w у день d має заняття
 * в трійці слотів (w + d) mod 3; різні хвилі завжди в різних трійках, тож не перетинаються.
 * Гурток для заняття — кругова ротація clubs[(position + d * 3 + lesson) mod C], де position —
 * номер групи в своїй хвилі, lesson — номер заняття в дні (0..2 за часом).
 *  - три заняття дня йдуть у ротації поспіль, тож при C >= 3 гуртки в групи не повторюються;
 *  - за тиждень номери ротації однієї групи — 15 поспіль, тож кожен гурток припадає рівно
 *    15 / C разів (при C = 5 — по 3; якщо C не ділить 15, різниця не більша за 1);
 *  - у межах хвилі position різні (їх не більше C), тож у той самий слот два гуртки
 *    (а отже й кабінети та викладачі) не збігаються.
 * Місткість: до 3 * C груп (15 груп при 5 гуртках — кожен гурток зайнятий у всіх 9 слотах).
 *
 * @param {{ groups: {id:number}[], clubs: {id:number}[] }} input
 * @returns {{groupId:number, dayOfWeek:number, startMinute:number, endMinute:number,
 *   activity:string, clubId:number|null}[]}
 */
function generateSchedule({ groups, clubs }) {
  if (groups.length === 0) return [];
  if (clubs.length < LESSONS_PER_DAY) {
    throw new ScheduleCapacityError(
      `Для розкладу потрібно щонайменше ${LESSONS_PER_DAY} гуртки, зараз їх ${clubs.length}`
    );
  }
  const maxGroups = maxGroupsFor(clubs.length);
  if (groups.length > maxGroups) {
    throw new ScheduleCapacityError(
      `Груп (${groups.length}) більше, ніж можна розвести за часом: ` +
        `${clubs.length} гуртків обслуговують щонайбільше ${maxGroups} груп без накладок`
    );
  }

  const sortedGroups = [...groups].sort(byId);
  const sortedClubs = [...clubs].sort(byId);
  const waves = Math.ceil(sortedGroups.length / sortedClubs.length);
  const slots = [];

  sortedGroups.forEach((group, groupIndex) => {
    const wave = groupIndex % waves;
    const position = Math.floor(groupIndex / waves);

    DAYS.forEach((dayOfWeek, dayIndex) => {
      let lesson = 0;
      for (const planned of planDay((wave + dayIndex) % MAX_WAVES)) {
        let clubId = null;
        if (planned.activity === ACTIVITY.CLUB) {
          const turn = position + dayIndex * LESSONS_PER_DAY + lesson;
          clubId = sortedClubs[turn % sortedClubs.length].id;
          lesson += 1;
        }
        slots.push({
          groupId: group.id,
          dayOfWeek,
          startMinute: planned.startMinute,
          endMinute: planned.endMinute,
          activity: planned.activity,
          clubId,
        });
      }
    });
  });

  return slots;
}

module.exports = { generateSchedule, ScheduleCapacityError, maxGroupsFor };
