const { BadRequestError } = require('../errors/AppError');

const KOPIYKAS_PER_UAH = 100;

/**
 * Перетворює суму в копійках у структуру з гривнями та копійками (Money Value Object)
 * @param {number} kopiykas ціле число копійок
 * @returns {{ uah: number, kopiykas: number }}
 */
function toMoney(kopiykas) {
  if (!Number.isInteger(kopiykas)) {
    throw new BadRequestError(`Amount in kopiykas must be an integer: ${kopiykas}`);
  }
  const uah = Number((kopiykas / KOPIYKAS_PER_UAH).toFixed(2));
  return {
    uah,
    kopiykas,
  };
}

module.exports = {
  toMoney,
  KOPIYKAS_PER_UAH,
};
