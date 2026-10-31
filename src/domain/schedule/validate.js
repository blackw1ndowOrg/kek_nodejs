const { DAY_START, DAY_END } = require('./template');

const CONFLICT = Object.freeze({
  GROUP_OVERLAP: 'GROUP_OVERLAP', // у групи два слоти, що перетинаються в часі
  CLUB_DOUBLE_BOOKED: 'CLUB_DOUBLE_BOOKED', // гурток (кабінет і викладач) у двох групах одночасно
  OUT_OF_HOURS: 'OUT_OF_HOURS', // слот поза межами дня
  INVALID_TIME: 'INVALID_TIME', // кінець не пізніше за початок
});

const overlaps = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

function addToBucket(buckets, key, slot) {
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(slot);
}

function collectOverlaps(buckets, type, describe, conflicts) {
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        if (overlaps(bucket[i], bucket[j])) {
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

  for (const slot of slots) {
    if (slot.endMinute <= slot.startMinute) {
      conflicts.push({ type: CONFLICT.INVALID_TIME, dayOfWeek: slot.dayOfWeek, slots: [slot] });
      continue;
    }
    if (slot.startMinute < DAY_START || slot.endMinute > DAY_END) {
      conflicts.push({ type: CONFLICT.OUT_OF_HOURS, dayOfWeek: slot.dayOfWeek, slots: [slot] });
    }
    addToBucket(byGroupDay, `${slot.groupId}:${slot.dayOfWeek}`, slot);
    if (slot.clubId !== null && slot.clubId !== undefined) {
      addToBucket(byClubDay, `${slot.clubId}:${slot.dayOfWeek}`, slot);
    }
  }

  collectOverlaps(byGroupDay, CONFLICT.GROUP_OVERLAP, (s) => ({ groupId: s.groupId }), conflicts);
  collectOverlaps(byClubDay, CONFLICT.CLUB_DOUBLE_BOOKED, (s) => ({ clubId: s.clubId }), conflicts);
  return conflicts;
}

module.exports = { validateSchedule, CONFLICT };
