const {
  groupProfitSchema,
  totalProfitSchema,
  forecastSchema,
} = require('../../../src/modules/analytics/analytics.schema');

describe('Analytics Schema Validation', () => {
  describe('groupProfitSchema', () => {
    test('валідує коректний числовий ID групи', () => {
      const parsed = groupProfitSchema.parse({ params: { id: 1 } });
      expect(parsed.params.id).toBe(1);
    });

    test('коерсить строковий ID у число', () => {
      const parsed = groupProfitSchema.parse({ params: { id: '42' } });
      expect(parsed.params.id).toBe(42);
    });

    test('помилка при непостійному або нульовому ID', () => {
      expect(() => groupProfitSchema.parse({ params: { id: 0 } })).toThrow(
        /Group ID must be positive/i
      );
      expect(() => groupProfitSchema.parse({ params: { id: -5 } })).toThrow(
        /Group ID must be positive/i
      );
    });

    test('помилка при дробовому числі', () => {
      expect(() => groupProfitSchema.parse({ params: { id: 3.14 } })).toThrow(
        /Group ID must be an integer/i
      );
    });

    test('помилка при нечисловому рядку з власним повідомленням Zod 4', () => {
      expect(() => groupProfitSchema.parse({ params: { id: 'invalid' } })).toThrow(
        /Group ID must be a number/i
      );
    });

    test('валідує опціональний attendanceRate у query', () => {
      const parsed = groupProfitSchema.parse({
        params: { id: 1 },
        query: { attendanceRate: '0.9' },
      });
      expect(parsed.params.id).toBe(1);
      expect(parsed.query.attendanceRate).toBe(0.9);
    });

    test('помилка при відсутності params або id', () => {
      expect(() => groupProfitSchema.parse({ params: {} })).toThrow();
      expect(() => groupProfitSchema.parse({})).toThrow();
    });
  });

  describe('totalProfitSchema', () => {
    test('проходить без query параметрів', () => {
      const parsed = totalProfitSchema.parse({});
      expect(parsed).toEqual({});
    });

    test('валідує валідний attendanceRate', () => {
      const parsed = totalProfitSchema.parse({ query: { attendanceRate: 0.85 } });
      expect(parsed.query.attendanceRate).toBe(0.85);
    });

    test('викидає помилку на невалідний attendanceRate (> 1 або від’ємний)', () => {
      expect(() => totalProfitSchema.parse({ query: { attendanceRate: 1.2 } })).toThrow(
        /attendanceRate cannot exceed 1/i
      );
      expect(() => totalProfitSchema.parse({ query: { attendanceRate: -0.1 } })).toThrow(
        /attendanceRate must be positive/i
      );
    });

    test('викидає помилку на нечисловий attendanceRate з власним повідомленням Zod 4', () => {
      expect(() => totalProfitSchema.parse({ query: { attendanceRate: 'not-a-number' } })).toThrow(
        /attendanceRate must be a number/i
      );
    });
  });

  describe('forecastSchema', () => {
    test('валідує коректні значення targetChildrenCount (0, 150, 300)', () => {
      expect(
        forecastSchema.parse({ body: { targetChildrenCount: 0 } }).body.targetChildrenCount
      ).toBe(0);
      expect(
        forecastSchema.parse({ body: { targetChildrenCount: 150 } }).body.targetChildrenCount
      ).toBe(150);
      expect(
        forecastSchema.parse({ body: { targetChildrenCount: 300 } }).body.targetChildrenCount
      ).toBe(300);
    });

    test('коерсить строкове числове значення targetChildrenCount', () => {
      const parsed = forecastSchema.parse({ body: { targetChildrenCount: '150' } });
      expect(parsed.body.targetChildrenCount).toBe(150);
    });

    test('викидає помилку валідації якщо targetChildrenCount > 300', () => {
      expect(() => forecastSchema.parse({ body: { targetChildrenCount: 301 } })).toThrow(
        /cannot exceed maximum capacity of 300/i
      );
      expect(() => forecastSchema.parse({ body: { targetChildrenCount: 500 } })).toThrow(
        /cannot exceed maximum capacity of 300/i
      );
    });

    test('викидає помилку валідації якщо targetChildrenCount від’ємний або дробовий', () => {
      expect(() => forecastSchema.parse({ body: { targetChildrenCount: -1 } })).toThrow(
        /must be non-negative/i
      );
      expect(() => forecastSchema.parse({ body: { targetChildrenCount: 15.5 } })).toThrow(
        /must be an integer/i
      );
    });

    test('викидає помилку якщо targetChildrenCount не є числом з власним повідомленням Zod 4', () => {
      expect(() =>
        forecastSchema.parse({ body: { targetChildrenCount: 'not-a-number' } })
      ).toThrow(/Target children count must be a number/i);
    });

    test('порожнє тіло або відсутність тіла проходить валідацію за замовчуванням', () => {
      const parsed1 = forecastSchema.parse({ body: {} });
      expect(parsed1.body).toEqual({});

      const parsed2 = forecastSchema.parse({});
      expect(parsed2.body).toEqual({});
    });

    test('валідує тіло з об’єктом demand та віковими категоріями', () => {
      const parsed = forecastSchema.parse({
        body: {
          demand: { 2: 25, 3: 45, 4: 35, 5: 20 },
          attendanceRate: 0.85,
          threshold: 12,
        },
      });
      expect(parsed.body.demand).toEqual({ 2: 25, 3: 45, 4: 35, 5: 20 });
      expect(parsed.body.attendanceRate).toBe(0.85);
      expect(parsed.body.threshold).toBe(12);
    });

    test('коерсить строкові значення attendanceRate та threshold', () => {
      const parsed = forecastSchema.parse({
        body: {
          attendanceRate: '0.8',
          threshold: '10',
        },
      });
      expect(parsed.body.attendanceRate).toBe(0.8);
      expect(parsed.body.threshold).toBe(10);
    });

    test('валідує вікові ключі 2, 3, 4, 5 у тілі запиту', () => {
      const parsed = forecastSchema.parse({
        body: { 2: 21, 3: 24, 4: 10, 5: 13 },
      });
      expect(parsed.body[2]).toBe(21);
      expect(parsed.body[3]).toBe(24);
      expect(parsed.body[4]).toBe(10);
      expect(parsed.body[5]).toBe(13);
    });

    test('коерсить коректні строкові значення вікового попиту та валідує невалідні з власним повідомленням Zod 4', () => {
      const parsed = forecastSchema.parse({ body: { 2: '21', 3: 20 } });
      expect(parsed.body[2]).toBe(21);
      expect(() => forecastSchema.parse({ body: { 2: '   ' } })).toThrow(/Demand must be a number/i);
      expect(() => forecastSchema.parse({ body: { 2: 'not-a-number' } })).toThrow(
        /Demand must be a number/i
      );
    });

    test('викидає помилку при від’ємному віковому попиті', () => {
      expect(() => forecastSchema.parse({ body: { 2: -5 } })).toThrow(/Demand must be non-negative/i);
    });

    test('викидає помилку при невалідних attendanceRate та threshold', () => {
      expect(() => forecastSchema.parse({ body: { attendanceRate: 1.5 } })).toThrow(
        /attendanceRate cannot exceed 1/i
      );
      expect(() => forecastSchema.parse({ body: { attendanceRate: 0 } })).toThrow(
        /attendanceRate must be positive/i
      );
      expect(() => forecastSchema.parse({ body: { attendanceRate: 'invalid' } })).toThrow(
        /attendanceRate must be a number/i
      );
      expect(() => forecastSchema.parse({ body: { threshold: -1 } })).toThrow();
      expect(() => forecastSchema.parse({ body: { threshold: 'invalid' } })).toThrow();
    });
  });
});
