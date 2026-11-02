const { ACTIVITY, DAY_START, DAY_END, LESSON_WINDOWS } = require('./template');

const CONFLICT = Object.freeze({
  GROUP_OVERLAP: 'GROUP_OVERLAP', // у групи два слоти, що перетинаються в часі
  CLUB_DOUBLE_BOOKED: 'CLUB_DOUBLE_BOOKED', // гурток (кабінет і викладач) у двох групах одночасно
  CLUB_REPEATED_IN_DAY: 'CLUB_REPEATED_IN_DAY', // той самий гурток двічі за день в однієї групи
  LESSON_OUT_OF_WINDOW: 'LESSON_OUT_OF_WINDOW', // заняття поза періодами 09:00–12:00 / 14:00–17:45
  OUT_OF_HOURS: 'OUT_OF_HOURS', // слот поза межами дня
  INVALID_TIME: 'INVALID_TIME', // кінець не пізніше за початок
});

const overlaps = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;
const always = () => true;

const inLessonWindow = (slot) =>
  LESSON_WINDOWS.some((window) => slot.startMinute >= window.start && slot.endMinute <= window.end);

function addToBucket(buckets, key, slot) {
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(slot);
}

function collectPairs(buckets, type, describe, conflicts, isConflict) {
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        if (isConflict(bucket[i], bucket[j])) {
          conflicts.push({
            type,
            dayOfWeek: bucket[i].dayOfWeek,
            ...describe(bucket[i]),
            slots: [bucket[i], bucket[j]],
          });
        }
      }
    }
  }
}

/**
 * Перевіряє слоти на конфлікти. Порівнюються інтервали, а не лише однаковий початок:
 * унікальні індекси БД ловлять тільки збіг startMinute.
 * Повертає порожній масив, якщо розклад коректний.
 * У конфліктах `slots` — посилання на самі передані слоти.
 */
function validateSchedule(slots) {
  const conflicts = [];
  const byGroupDay = new Map();
  const byClubDay = new Map();
  const byGroupDayClub = new Map();

  for (const slot of slots) {
    if (slot.endMinute <= slot.startMinute) {
      conflicts.push({ type: CONFLICT.INVALID_TIME, dayOfWeek: slot.dayOfWeek, slots: [slot] });
      continue;
    }
    if (slot.startMinute < DAY_START || slot.endMinute > DAY_END) {
      conflicts.push({ type: CONFLICT.OUT_OF_HOURS, dayOfWeek: slot.dayOfWeek, slots: [slot] });
    }
    if (slot.activity === ACTIVITY.CLUB && !inLessonWindow(slot)) {
      conflicts.push({
        type: CONFLICT.LESSON_OUT_OF_WINDOW,
        dayOfWeek: slot.dayOfWeek,
        slots: [slot],
      });
    }
    addToBucket(byGroupDay, `${slot.groupId}:${slot.dayOfWeek}`, slot);
    if (slot.clubId !== null && slot.clubId !== undefined) {
      addToBucket(byClubDay, `${slot.clubId}:${slot.dayOfWeek}`, slot);
      addToBucket(byGroupDayClub, `${slot.groupId}:${slot.dayOfWeek}:${slot.clubId}`, slot);
    }
  }

  collectPairs(
    byGroupDay,
    CONFLICT.GROUP_OVERLAP,
    (s) => ({ groupId: s.groupId }),
    conflicts,
    overlaps
  );
  collectPairs(
    byClubDay,
    CONFLICT.CLUB_DOUBLE_BOOKED,
    (s) => ({ clubId: s.clubId }),
    conflicts,
    overlaps
  );
  collectPairs(
    byGroupDayClub,
    CONFLICT.CLUB_REPEATED_IN_DAY,
    (s) => ({ groupId: s.groupId, clubId: s.clubId }),
    conflicts,
    always
  );
  return conflicts;
}

module.exports = { validateSchedule, CONFLICT };
