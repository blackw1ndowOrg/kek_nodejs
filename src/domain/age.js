const { BadRequestError } = require('../errors/AppError');

const SEPTEMBER = 8; // місяці в Date рахуються з 0
const FIRST_DAY = 1;

function toUtcDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid birth date: ${value}`);
  }
  return date;
}

/**
 * @param {Date|string} birthDate дата народження ('YYYY-MM-DD' або Date)
 * @param {number} targetYear рік, на 1 вересня якого рахуємо вік
 * @returns {number}
 */
function ageOnSeptemberFirst(birthDate, targetYear) {
  if (!Number.isInteger(targetYear)) {
    throw new BadRequestError(`Target year must be an integer: ${targetYear}`);
  }
  const birth = toUtcDate(birthDate);
  const septemberFirst = new Date(Date.UTC(targetYear, SEPTEMBER, FIRST_DAY));
  if (birth > septemberFirst) {
    throw new BadRequestError('Birth date is after September 1 of the target year');
  }

  const years = targetYear - birth.getUTCFullYear();
  const birthdayNotYetCome =
    birth.getUTCMonth() > SEPTEMBER ||
    (birth.getUTCMonth() === SEPTEMBER && birth.getUTCDate() > FIRST_DAY);
  return birthdayNotYetCome ? years - 1 : years;
}

/**
 * Рік, з якого почався поточний навчальний рік (навчальний рік триває з 1 вересня по 31 серпня).
 * Передається в ageOnSeptemberFirst як targetYear: 24.10.2026 і 01.03.2027 -> 2026.
 *
 * @param {Date} [date] дата, для якої визначаємо навчальний рік (за замовчуванням — зараз)
 * @returns {number}
 */
function currentAcademicYear(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid date: ${date}`);
  }
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= SEPTEMBER ? year : year - 1;
}

module.exports = { ageOnSeptemberFirst, currentAcademicYear };
