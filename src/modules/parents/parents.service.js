const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/prisma');
const { NotFoundError, ConflictError } = require('../../errors/AppError');
const { parentsRepository } = require('./parents.repository');

class ParentsService {
  constructor(repository = parentsRepository, db = prisma) {
    this.repository = repository;
    this.db = db;
  }

  async createParent({ fullName, phone, debt = 0, user }) {
    if (user) {
      const existingUser = await this.db.user.findUnique({
        where: { email: user.email },
      });

      if (existingUser) {
        throw new ConflictError('Користувач з таким email вже існує');
      }
    }

    return this.db.$transaction(async (tx) => {
      let createdUser = null;

      if (user) {
        const passwordHash = await bcrypt.hash(user.password, 10);
        createdUser = await tx.user.create({
          data: {
            email: user.email,
            passwordHash,
            role: 'PARENT',
          },
        });
      }

      const parent = await this.repository.create(
        {
          fullName,
          phone,
          debt,
          userId: createdUser ? createdUser.id : null,
        },
        tx
      );

      return parent;
    });
  }

  async getAllParents(query = {}) {
    return this.repository.findAll(query);
  }

  async getParentById(id) {
    const parent = await this.repository.findById(id);
    if (!parent) {
      throw new NotFoundError('Батьків з таким ID не знайдено');
    }
    return parent;
  }

  async updateParent(id, updateData) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Батьків з таким ID не знайдено');
    }

    return this.repository.update(id, updateData);
  }

  async deleteParent(id) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Батьків з таким ID не знайдено');
    }

    return this.repository.delete(id);
  }
}

const parentsService = new ParentsService();

module.exports = { ParentsService, parentsService };
