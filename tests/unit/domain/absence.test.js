const {
  KINDERGARTEN_TIME_ZONE,
  WORKING_DAYS_PER_MONTH,
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
} = require('../../../src/domain/absence');
const { BadRequestError } = require('../../../src/errors/AppError');

// Київ: UTC+2 узимку (з 25.10.2026), UTC+3 улітку (з 29.03.2026)
const WINTER_DAY = '2026-11-12';
const SUMMER_DAY = '2026-10-15';

describe('domain/absence', () => {
  test('константи', () => {
    expect(KINDERGARTEN_TIME_ZONE).toBe('Europe/Kyiv');
    expect(WORKING_DAYS_PER_MONTH).toBe(21);
  });

  test('toIsoDate: Date з поля @db.Date і рядок', () => {
    expect(toIsoDate(new Date('2026-11-12T00:00:00Z'))).toBe('2026-11-12');
    expect(toIsoDate('2026-11-12')).toBe('2026-11-12');
  });

  describe('часовий пояс', () => {
    test.each([
      ['узимку +2 год', '2026-11-12T10:00:00Z', 120],
      ['улітку +3 год', '2026-07-01T10:00:00Z', 180],
    ])('зсув Києва %s', (_name, instant, offset) => {
      expect(timeZoneOffsetMinutes(new Date(instant))).toBe(offset);
    });

    test('інший часовий пояс', () => {
      expect(timeZoneOffsetMinutes(new Date('2026-11-12T10:00:00Z'), 'UTC')).toBe(0);
    });

    test('zonedDateTime: 08:30 за Києвом узимку і влітку', () => {
      expect(zonedDateTime(WINTER_DAY, 510).toISOString()).toBe('2026-11-12T06:30:00.000Z');
      expect(zonedDateTime(SUMMER_DAY, 510).toISOString()).toBe('2026-10-15T05:30:00.000Z');
      expect(zonedDateTime(WINTER_DAY, 510, 'UTC').toISOString()).toBe('2026-11-12T08:30:00.000Z');
    });

    test('перший будній день після переходу на зимовий час', () => {
      expect(noticeDeadline('2026-10-26').toISOString()).toBe('2026-10-26T06:30:00.000Z');
    });
  });

  test('noticeDeadline приймає і Date з бази', () => {
    expect(noticeDeadline(new Date(`${WINTER_DAY}T00:00:00Z`))).toEqual(
      new Date('2026-11-12T08:30:00+02:00')
    );
  });

  describe('isCounted: повідомлення раніше за 08:30 за Києвом', () => {
    const at = (time) => new Date(`${WINTER_DAY}T${time}+02:00`);

    test.each([
      ['напередодні', new Date('2026-11-11T20:00:00+02:00'), true],
      ['о 08:29:59', at('08:29:59'), true],
      ['о 08:29:59.999', at('08:29:59.999'), true],
      ['о 08:30:00 — уже пізно', at('08:30:00'), false],
      ['о 12:00', at('12:00:00'), false],
    ])('%s -> %s', (_name, notifiedAt, counted) => {
      expect(isCounted({ date: new Date(`${WINTER_DAY}T00:00:00Z`), notifiedAt })).toBe(counted);
    });

    test('влітку межа теж 08:30 за Києвом, а не за UTC', () => {
      const date = SUMMER_DAY;
      expect(isCounted({ date, notifiedAt: new Date('2026-10-15T08:29:59+03:00') })).toBe(true);
      expect(isCounted({ date, notifiedAt: new Date('2026-10-15T08:30:00+03:00') })).toBe(false);
    });
  });

  describe('сьогодні за Києвом', () => {
    test('о 23:30 за Києвом у UTC ще вчора, а в садку вже завтра', () => {
      const instant = new Date('2026-11-09T22:30:00Z'); // 00:30 10.11 за Києвом
      expect(localDateIso(instant)).toBe('2026-11-10');
      expect(localDateIso(instant, 'UTC')).toBe('2026-11-09');
    });

    test('місяць змінюється за Києвом', () => {
      expect(localMonth(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11');
      expect(localMonth(new Date('2026-10-31T22:30:00Z'), 'UTC')).toBe('2026-10');
    });
  });

  test.each([
    ['2026-11-13', false], // п'ятниця
    ['2026-11-14', true], // субота
    ['2026-11-15', true], // неділя
    ['2026-11-16', false], // понеділок
  ])('isWeekend(%s) -> %s', (date, weekend) => {
    expect(isWeekend(date)).toBe(weekend);
  });

  describe('monthRange', () => {
    test('межі місяця [перше число, перше число наступного)', () => {
      expect(monthRange('2026-10')).toEqual({
        from: new Date('2026-10-01T00:00:00Z'),
        to: new Date('2026-11-01T00:00:00Z'),
      });
    });

    test('грудень переходить у січень наступного року', () => {
      expect(monthRange('2026-12').to).toEqual(new Date('2027-01-01T00:00:00Z'));
    });

    test.each(['2026-13', '2026-1', '26-10', 'жовтень'])('%p -> 400', (month) => {
      expect(() => monthRange(month)).toThrow(BadRequestError);
    });
  });

  describe('mealDays', () => {
    test.each([
      [0, 21],
      [2, 19],
      [21, 0],
      [25, 0],
    ])('%i зарахованих відсутностей -> %i днів харчування', (absences, days) => {
      expect(mealDays(absences)).toBe(days);
    });

    test('інша кількість робочих днів', () => {
      expect(mealDays(2, 20)).toBe(18);
    });

    test.each([-1, 1.5, '2', null])('%p -> 400', (absences) => {
      expect(() => mealDays(absences)).toThrow(BadRequestError);
    });
  });
});
