const { ageOnSeptemberFirst, currentAcademicYear } = require('../../../src/domain/age');
const { BadRequestError } = require('../../../src/errors/AppError');

describe('ageOnSeptemberFirst', () => {
  test.each([
    ['2022-09-01', 2026, 4], // день народження саме 1 вересня
    ['2022-09-02', 2026, 3], // день після — ще не виповнилось
    ['2022-03-15', 2026, 4], // народився навесні
    ['2022-12-31', 2026, 3], // народився наприкінці року
    ['2020-02-29', 2026, 6], // високосний рік
    ['2026-09-01', 2026, 0], // народився в сам день
  ])('%s на 1.09.%i -> %i', (birthDate, year, expected) => {
    expect(ageOnSeptemberFirst(birthDate, year)).toBe(expected);
  });

  test('приймає Date так само, як рядок', () => {
    expect(ageOnSeptemberFirst(new Date(Date.UTC(2022, 2, 15)), 2026)).toBe(4);
  });

  test.each([
    ['дата пізніше 1 вересня', '2026-09-02', 2026],
    ['некоректна дата', 'not-a-date', 2026],
    ['дробовий рік', '2022-01-01', 2026.5],
  ])('%s -> BadRequestError', (_name, birthDate, year) => {
    expect(() => ageOnSeptemberFirst(birthDate, year)).toThrow(BadRequestError);
  });
});

describe('currentAcademicYear', () => {
  test.each([
    ['2026-09-01', 2026], // перший день навчального року
    ['2026-08-31', 2025], // останній день попереднього
    ['2026-10-24', 2026], // звичайний день
    ['2027-03-01', 2026], // весна того самого навчального року
    ['2026-12-31', 2026], // кінець календарного року
    ['2027-01-01', 2026], // новий календарний рік, навчальний той самий
  ])('%s -> %i', (date, expected) => {
    expect(currentAcademicYear(new Date(date))).toBe(expected);
  });

  test('без аргументу — для поточної дати', () => {
    expect(currentAcademicYear()).toBe(currentAcademicYear(new Date()));
  });

  test.each([new Date('abc'), '2026-10-24', null])('%p -> BadRequestError', (date) => {
    expect(() => currentAcademicYear(date)).toThrow(BadRequestError);
  });
});
