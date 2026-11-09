const { BadRequestError } = require('../errors/AppError');

// Відсутність дитини і харчування. Правило з README: якщо батьки попередили про відсутність
// до 08:30 дня відсутності, харчування за цей день не нараховується.
// Час рахуємо за Києвом, бо сервер може працювати в UTC: 08:30 за Києвом — це 05:30 або 06:30 UTC.

const KINDERGARTEN_TIME_ZONE = 'Europe/Kyiv';
const NOTICE_DEADLINE_MINUTES = 8 * 60 + 30; // 08:30
const WORKING_DAYS_PER_MONTH = 21; // днів харчування в місяці без відсутностей
const MS_PER_MINUTE = 60 * 1000;
const SUNDAY = 0;
const SATURDAY = 6;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 'YYYY-MM-DD' з Date (поле @db.Date приходить як північ UTC) або з рядка як є */
function toIsoDate(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : date;
}

/** Частини дати й часу в часовому поясі timeZone на момент instant */
function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/** На скільки хвилин час у timeZone випереджає UTC у момент instant (Київ: 120 узимку, 180 улітку) */
function timeZoneOffsetMinutes(instant, timeZone = KINDERGARTEN_TIME_ZONE) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MS_PER_MINUTE);
}

/** Момент, коли в timeZone на дату dateIso настає minutes хвилин від півночі */
function zonedDateTime(dateIso, minutes, timeZone = KINDERGARTEN_TIME_ZONE) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, minutes);
  const offset = timeZoneOffsetMinutes(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - offset * MS_PER_MINUTE);
}

/** Останній момент для повідомлення: 08:30 за Києвом у день відсутності */
function noticeDeadline(date) {
  return zonedDateTime(toIsoDate(date), NOTICE_DEADLINE_MINUTES);
}

/** Відсутність зарахована (харчування не нараховується), якщо батьки повідомили раніше за 08:30 */
function isCounted({ date, notifiedAt }) {
  return notifiedAt.getTime() < noticeDeadline(date).getTime();
}

/** Сьогоднішня дата в садку (за Києвом) у форматі 'YYYY-MM-DD' */
function localDateIso(instant, timeZone = KINDERGARTEN_TIME_ZONE) {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Поточний місяць у садку 'YYYY-MM' */
function localMonth(instant, timeZone = KINDERGARTEN_TIME_ZONE) {
  return localDateIso(instant, timeZone).slice(0, 7);
}

function isWeekend(dateIso) {
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return weekday === SATURDAY || weekday === SUNDAY;
}

/** Межі місяця 'YYYY-MM' для запиту до поля @db.Date: [from, to) */
function monthRange(month) {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new BadRequestError(`Місяць має бути у форматі YYYY-MM: ${month}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/** Днів харчування в місяці: робочі дні мінус зараховані відсутності, але не менше 0 */
function mealDays(countedAbsences, workingDays = WORKING_DAYS_PER_MONTH) {
  if (!Number.isInteger(countedAbsences) || countedAbsences < 0) {
    throw new BadRequestError(
      `Кількість відсутностей має бути цілим числом ≥ 0: ${countedAbsences}`
    );
  }
  return Math.max(0, workingDays - countedAbsences);
}

module.exports = {
  KINDERGARTEN_TIME_ZONE,
  NOTICE_DEADLINE_MINUTES,
  WORKING_DAYS_PER_MONTH,
  MONTH_PATTERN,
  toIsoDate,
  timeZoneOffsetMinutes,
  zonedDateTime,
  noticeDeadline,
  isCounted,
  localDateIso,
  localMonth,
  isWeekend,
  monthRange,
  mealDays,
};
