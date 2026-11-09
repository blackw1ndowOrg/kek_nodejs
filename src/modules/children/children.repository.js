const { prisma } = require('../../config/prisma');
const { withActor } = require('../../config/audit');

// Лише запити до бази. Хто що може бачити й змінювати, вирішує children.service.js.
// Записи йдуть через withActor: в історії змін ("AuditLog") видно, хто їх зробив.

const CHILD_SELECT = Object.freeze({
  id: true,
  fullName: true,
  birthDate: true,
  notes: true,
  discountPercent: true,
  paymentPlan: true,
  hasDeputyRelatives: true,
  paidUntil: true,
  isActive: true,
  groupId: true,
  createdAt: true,
  updatedAt: true,
});

/** Умова «дитина прив'язана до батька з цим userId» (через таблицю ParentChild) */
const ownedByParent = (parentUserId) =>
  parentUserId === undefined ? {} : { parents: { some: { parent: { userId: parentUserId } } } };

class ChildrenRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  /**
   * @param {{ groupId?: number, isActive?: boolean, parentUserId?: number }} filters
   *   parentUserId — лише діти цього батька
   */
  async findMany({ groupId, isActive, parentUserId } = {}) {
    return this.db.child.findMany({
      where: { groupId, isActive, ...ownedByParent(parentUserId) },
      select: CHILD_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** findFirst, бо findUnique не приймає умову на батьків. Чужа дитина -> null */
  async findById(id, parentUserId) {
    return this.db.child.findFirst({
      where: { id, ...ownedByParent(parentUserId) },
      select: CHILD_SELECT,
    });
  }

  /** Скільки з переданих id батьків існує в базі */
  async countParents(parentIds) {
    return this.db.parent.count({ where: { id: { in: parentIds } } });
  }

  /**
   * Створює дитину і в тій самій операції прив'язує її до батьків
   * @param {number} actorUserId хто створює (для історії змін)
   */
  async create(data, parentIds, actorUserId) {
    return withActor(this.db, actorUserId, (tx) =>
      tx.child.create({
        data: {
          ...data,
          parents: {
            create: parentIds.map((parentId) => ({ parent: { connect: { id: parentId } } })),
          },
        },
        select: CHILD_SELECT,
      })
    );
  }

  /** @param {number} actorUserId хто змінює (для історії змін) */
  async update(id, data, actorUserId) {
    return withActor(this.db, actorUserId, (tx) =>
      tx.child.update({
        where: { id },
        data,
        select: CHILD_SELECT,
      })
    );
  }

  /** Назва й вік групи: щоб звірити з ними вік дитини при зміні дати народження */
  async findGroup(id) {
    return this.db.group.findUnique({
      where: { id },
      select: { name: true, age: true },
    });
  }
}

const childrenRepository = new ChildrenRepository();

module.exports = { ChildrenRepository, childrenRepository, CHILD_SELECT };
