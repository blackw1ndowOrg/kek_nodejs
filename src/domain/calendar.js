const { BadRequestError } = require('../errors/AppError');
const { MONTH_PATTERN, isWeekend, localMonth } = require('./absence');

// Робочий календар садка: робочі дні — понеділок–п'ятниця, мінус свята з налаштувань (HOLIDAYS).
// Дати свят — календарні ('YYYY-MM-DD'), тож день тижня рахуємо через UTC без зсуву поясу.
// «Поточний місяць» — за Києвом (localMonth), бо сервер може працювати в UTC.

const MONTHS_IN_YEAR = 12;

function assertYearMonth(year, month) {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new BadRequestError(`Рік має бути цілим числом від 1970 до 9999: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_IN_YEAR) {
    throw new BadRequestError(`Місяць має бути цілим числом від 1 до 12: ${month}`);
  }
}

/** Кількість днів у місяці (month: 1–12): лютий високосного року — 29 */
function daysInMonth(year, month) {
  assertYearMonth(year, month);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' для дня місяця */
function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Робочі дні місяця: Пн–Пт мінус свята.
 * Свято у вихідний не віднімається (його й так немає серед Пн–Пт), свято з іншого місяця
 * не впливає, а дубль у списку не віднімається вдруге.
 *
 * @param {number} year напр. 2026
 * @param {number} month 1–12
 * @param {string[]} [holidays=[]] дати 'YYYY-MM-DD'
 * @returns {number}
 */
function workingDays(year, month, holidays = []) {
  if (!Array.isArray(holidays)) {
    throw new BadRequestError('Свята мають бути масивом дат YYYY-MM-DD');
  }
  const total = daysInMonth(year, month);
  const off = new Set(holidays);
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const date = isoDate(year, month, day);
    if (!isWeekend(date) && !off.has(date)) {
      count += 1;
    }
  }
  return count;
}

/** 'YYYY-MM' -> { year, month } */
function parseMonth(value) {
  const match = MONTH_PATTERN.exec(value);
  if (!match) {
    throw new BadRequestError(`Місяць має бути у форматі YYYY-MM: ${value}`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Робочі дні місяця 'YYYY-MM' */
function workingDaysInMonth(value, holidays = []) {
  const { year, month } = parseMonth(value);
  return workingDays(year, month, holidays);
}

/** 'YYYY-MM' + n місяців -> 'YYYY-MM' */
function addMonths(value, count) {
  const { year, month } = parseMonth(value);
  const index = year * MONTHS_IN_YEAR + (month - 1) + count;
  const nextYear = Math.floor(index / MONTHS_IN_YEAR);
  const nextMonth = (index % MONTHS_IN_YEAR) + 1;
  // Результат має лишитися в межах календаря (1970-01…9999-12), інакше — зрозуміла 400
  assertYearMonth(nextYear, nextMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** count місяців поспіль, починаючи з from: ['2026-11', '2026-12', '2027-01', …] */
function monthSequence(from, count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestError(`Кількість місяців має бути цілим числом ≥ 1: ${count}`);
  }
  return Array.from({ length: count }, (_, i) => addMonths(from, i));
}

/** Поточний місяць садка 'YYYY-MM' за Києвом */
function currentMonth(now = new Date()) {
  return localMonth(now);
}

module.exports = {
  MONTH_PATTERN,
  daysInMonth,
  workingDays,
  workingDaysInMonth,
  parseMonth,
  addMonths,
  monthSequence,
  currentMonth,
};
