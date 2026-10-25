const { prisma } = require('../../config/prisma');

class BillingRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  /** Child along with their parents' userId (to verify if the child belongs to this user) */
  async findChildWithParents(childId) {
    return this.db.child.findUnique({
      where: { id: childId },
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
  }

  /**
   * Updates paidUntil only if it matches the expected date (optimistic concurrency check to prevent double payment).
   * 
   * @param {string} childId
   * @param {Date|null} expectedPaidUntil
   * @param {Date} newPaidUntil
   * @returns {Promise<number>} Number of updated rows (0 if modified concurrently by another request)
   */
  async updatePaidUntil(childId, expectedPaidUntil, newPaidUntil) {
    const result = await this.db.child.updateMany({
      where: { id: childId, paidUntil: expectedPaidUntil },
      data: { paidUntil: newPaidUntil },
    });
    return result.count;
  }
}

const billingRepository = new BillingRepository();

module.exports = { BillingRepository, billingRepository };