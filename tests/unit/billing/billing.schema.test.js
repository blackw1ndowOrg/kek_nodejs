const {
  PAYMENT_PLANS,
  childParamsSchema,
  getChildBillingSchema,
  payChildSchema,
} = require('../../../src/modules/billing/billing.schema');

describe('PAYMENT_PLANS', () => {
  test('містить MONTHLY і YEARLY', () => {
    expect(PAYMENT_PLANS).toEqual(['MONTHLY', 'YEARLY']);
  });
});

describe('childParamsSchema', () => {
  test('childId з URL стає числом', () => {
    expect(childParamsSchema.parse({ childId: '7' })).toEqual({ childId: 7 });
  });

  test.each(['abc', '0', '-1', '1.5', ''])('childId %p -> помилка', (childId) => {
    expect(childParamsSchema.safeParse({ childId }).success).toBe(false);
  });

  test('повідомлення про помилку українською', () => {
    const result = childParamsSchema.safeParse({ childId: '-1' });
    expect(result.error.issues[0].message).toBe('Некоректний id дитини');
  });
});

describe('getChildBillingSchema', () => {
  test('валідні params', () => {
    expect(getChildBillingSchema.parse({ params: { childId: '3' } })).toEqual({
      params: { childId: 3 },
    });
  });

  test('без params -> помилка', () => {
    expect(getChildBillingSchema.safeParse({}).success).toBe(false);
  });
});

describe('payChildSchema', () => {
  const params = { childId: '3' };

  test.each([['MONTHLY'], ['YEARLY']])('plan %s -> валідно', (plan) => {
    expect(payChildSchema.parse({ params, body: { plan } })).toEqual({
      params: { childId: 3 },
      body: { plan },
    });
  });

  test.each([
    ['тіла немає', undefined],
    ['порожнє тіло', {}],
  ])('%s -> валідно (plan необов’язковий)', (_name, body) => {
    expect(payChildSchema.safeParse({ params, body }).success).toBe(true);
  });

  test.each([
    ['невідомий plan', { plan: 'WEEKLY' }],
    ['plan у нижньому регістрі', { plan: 'monthly' }],
    ['plan числом', { plan: 1 }],
    ['невідоме поле', { plan: 'MONTHLY', amount: 100 }],
  ])('%s -> помилка', (_name, body) => {
    expect(payChildSchema.safeParse({ params, body }).success).toBe(false);
  });

  test('невалідний childId -> помилка', () => {
    expect(payChildSchema.safeParse({ params: { childId: 'x' }, body: {} }).success).toBe(false);
  });
});
