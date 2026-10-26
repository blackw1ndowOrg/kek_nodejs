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
    // Хешуємо пароль ДО транзакції (важка CPU-операція)
    let passwordHash = null;
    if (user) {
      passwordHash = await bcrypt.hash(user.password, 10);
    }

    try {
      return await this.db.$transaction(async (tx) => {
        let createdUser = null;

        if (user) {
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
    } catch (err) {
      // Обробка помилки унікальності email від Prisma (race condition)
      if (err.code === 'P2002') {
        throw new ConflictError('Користувач з таким email вже існує');
      }
      throw err;
    }
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

    if (existing.debt > 0) {
      throw new ConflictError(
        'Неможливо видалити профіль батьків з непогашеним боргом'
      );
    }

    return this.db.$transaction(async (tx) => {
      await this.repository.delete(id, tx);
      if (existing.userId) {
        await tx.user.delete({ where: { id: existing.userId } });
      }
    });
  }
}

const parentsService = new ParentsService();

module.exports = { ParentsService, parentsService };
