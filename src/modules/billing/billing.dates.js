function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Adds months with clamping to the last day of the month (e.g., Jan 31 + 1 month = Feb 28/29) */
function addMonthsUtc(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/** 'YYYY-MM-DD' or null */
function toIsoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

module.exports = { startOfUtcDay, addMonthsUtc, toIsoDate };