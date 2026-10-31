const { ACTIVITY, DAYS, DAY_TEMPLATE, LESSONS_PER_DAY } = require('./template');

class ScheduleCapacityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScheduleCapacityError';
  }
}

const byId = (a, b) => a.id - b.id;

/**
 * Детермінований генератор тижневого розкладу (без Math.random).
 *
 * Заняття роздаємо за круговою ротацією: гурток для групи g у занятті t тижня — це
 * clubs[(g + t) mod C], де t — наскрізний номер заняття (день * LESSONS_PER_DAY + номер у дні).
 *  - у межах одного дня t йдуть поспіль, тож при LESSONS_PER_DAY <= C гуртки не повторюються;
 *  - у той самий момент різні групи мають різні g, тож при G <= C два гуртки (а отже й
 *    кабінети та викладачі) ніколи не збігаються;
 *  - при C = 5 і 15 заняттях на тиждень кожен гурток припадає рівно 3 рази.
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
  if (groups.length > clubs.length) {
    throw new ScheduleCapacityError(
      `Груп (${groups.length}) більше, ніж гуртків (${clubs.length}): кабінети неминуче перетнуться`
    );
  }

  const sortedGroups = [...groups].sort(byId);
  const sortedClubs = [...clubs].sort(byId);
  const slots = [];

  sortedGroups.forEach((group, groupIndex) => {
    DAYS.forEach((dayOfWeek, dayIndex) => {
      let lesson = 0;
      for (const template of DAY_TEMPLATE) {
        let clubId = null;
        if (template.activity === ACTIVITY.CLUB) {
          const turn = groupIndex + dayIndex * LESSONS_PER_DAY + lesson;
          clubId = sortedClubs[turn % sortedClubs.length].id;
          lesson += 1;
        }
        slots.push({
          groupId: group.id,
          dayOfWeek,
          startMinute: template.startMinute,
          endMinute: template.endMinute,
          activity: template.activity,
          clubId,
        });
      }
    });
  });

  return slots;
}

module.exports = { generateSchedule, ScheduleCapacityError };
