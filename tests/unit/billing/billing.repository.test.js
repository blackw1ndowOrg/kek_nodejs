const {
  BillingRepository,
  billingRepository,
} = require('../../../src/modules/billing/billing.repository');

function createRepository({ updatedCount = 1 } = {}) {
  const db = {
    child: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
    },
  };
  return { db, repository: new BillingRepository(db) };
}

describe('BillingRepository', () => {
  test('експортований екземпляр за замовчуванням', () => {
    expect(billingRepository).toBeInstanceOf(BillingRepository);
  });

  test('findChildWithParents: шукає за id і вибирає потрібні поля', async () => {
    const { db, repository } = createRepository();
    const child = { id: 5 };
    db.child.findUnique.mockResolvedValueOnce(child);

    await expect(repository.findChildWithParents(5)).resolves.toBe(child);
    expect(db.child.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: {
        id: true,
        fullName: true,
        discountPercent: true,
        paymentPlan: true,
        paidUntil: true,
        isActive: true,
        group: { select: { age: true } },
        parents: { select: { parent: { select: { userId: true } } } },
      },
    });
  });

  test('findChildWithParents: дитини немає -> null', async () => {
    const { repository } = createRepository();
    await expect(repository.findChildWithParents(99)).resolves.toBeNull();
  });

  describe('updatePaidUntil', () => {
    const newDate = new Date('2026-11-26T00:00:00Z');

    test('оновлює лише якщо paidUntil збігається з очікуваним; повертає кількість рядків', async () => {
      const { db, repository } = createRepository({ updatedCount: 1 });
      const expected = new Date('2026-10-30T00:00:00Z');
      await expect(repository.updatePaidUntil(5, expected, newDate)).resolves.toBe(1);
      expect(db.child.updateMany).toHaveBeenCalledWith({
        where: { id: 5, paidUntil: expected },
        data: { paidUntil: newDate },
      });
    });

    test('очікуваний paidUntil = null (раніше не платили)', async () => {
      const { db, repository } = createRepository();
      await repository.updatePaidUntil(5, null, newDate);
      expect(db.child.updateMany).toHaveBeenCalledWith({
        where: { id: 5, paidUntil: null },
        data: { paidUntil: newDate },
      });
    });

    test('конкурентна зміна -> 0 оновлених рядків', async () => {
      const { repository } = createRepository({ updatedCount: 0 });
      await expect(repository.updatePaidUntil(5, null, newDate)).resolves.toBe(0);
    });
  });
});
