const {
  groupProfitSchema,
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
      expect(() => groupProfitSchema.parse({ params: { id: 0 } })).toThrow();
      expect(() => groupProfitSchema.parse({ params: { id: -5 } })).toThrow();
    });

    test('помилка при дробовому числі', () => {
      expect(() => groupProfitSchema.parse({ params: { id: 3.14 } })).toThrow();
    });

    test('помилка при нечисловому рядку', () => {
      expect(() => groupProfitSchema.parse({ params: { id: 'invalid' } })).toThrow();
    });

    test('помилка при відсутності params або id', () => {
      expect(() => groupProfitSchema.parse({ params: {} })).toThrow();
      expect(() => groupProfitSchema.parse({})).toThrow();
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

    test('викидає помилку якщо targetChildrenCount не є числом', () => {
      expect(() =>
        forecastSchema.parse({ body: { targetChildrenCount: 'not-a-number' } })
      ).toThrow();
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

    test('викидає помилку при невалідних attendanceRate та threshold', () => {
      expect(() => forecastSchema.parse({ body: { attendanceRate: 1.5 } })).toThrow();
      expect(() => forecastSchema.parse({ body: { attendanceRate: 0 } })).toThrow();
      expect(() => forecastSchema.parse({ body: { attendanceRate: 'invalid' } })).toThrow();
      expect(() => forecastSchema.parse({ body: { threshold: -1 } })).toThrow();
      expect(() => forecastSchema.parse({ body: { threshold: 'invalid' } })).toThrow();
    });
  });
});
