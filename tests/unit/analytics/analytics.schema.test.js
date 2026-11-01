const { groupProfitSchema } = require('../../../src/modules/analytics/analytics.schema');

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
});

