const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/prisma');
const { NotFoundError, ConflictError } = require('../../errors/AppError');
const { staffRepository } = require('./staff.repository');

class StaffService {
  constructor(repository = staffRepository, db = prisma) {
    this.repository = repository;
    this.db = db;
  }

  async createStaff({ fullName, type, isActive = true, user }) {
    // Хешуємо пароль ДО транзакції (важка CPU-операція)
    let passwordHash = null;
    if (user) {
      passwordHash = await bcrypt.hash(user.password, 10);
    }

    try {
      return await this.db.$transaction(async (tx) => {
        let createdUser = null;

        if (user) {
          const role = type === 'MANAGER' ? 'MANAGER' : 'TEACHER';
          createdUser = await tx.user.create({
            data: {
              email: user.email,
              passwordHash,
              role,
            },
          });
        }

        const staff = await this.repository.create(
          {
            fullName,
            type,
            isActive,
            userId: createdUser ? createdUser.id : null,
          },
          tx
        );

        return staff;
      });
    } catch (err) {
      // Обробка помилки унікальності email від Prisma (race condition)
      if (err.code === 'P2002') {
        throw new ConflictError('Користувач з таким email вже існує');
      }
      throw err;
    }
  }

  async getAllStaff(query = {}) {
    return this.repository.findAll(query);
  }

  async getStaffById(id) {
    const staff = await this.repository.findById(id);
    if (!staff) {
      throw new NotFoundError('Працівника з таким ID не знайдено');
    }
    return staff;
  }

  async updateStaff(id, updateData) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Працівника з таким ID не знайдено');
    }

    // Захист: заборона деактивації закріпленого вихователя/помічника
    if (
      updateData.isActive === false &&
      (existing.educatorOf || existing.assistantOf || existing.clubTaught)
    ) {
      throw new ConflictError(
        'Неможливо деактивувати співробітника, закріпленого за діючою групою або гуртком'
      );
    }

    return this.db.$transaction(async (tx) => {
      const updated = await this.repository.update(id, updateData, tx);

      // Синхронізація User.role при зміні type (EDUCATOR/ASSISTANT/CLUB_TEACHER → TEACHER, MANAGER → MANAGER)
      if (updateData.type && existing.userId) {
        const newRole = updateData.type === 'MANAGER' ? 'MANAGER' : 'TEACHER';
        await tx.user.update({
          where: { id: existing.userId },
          data: { role: newRole },
        });
      }

      return updated;
    });
  }

  async deleteStaff(id) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Працівника з таким ID не знайдено');
    }

    if (existing.educatorOf || existing.assistantOf || existing.clubTaught) {
      throw new ConflictError(
        'Неможливо видалити співробітника, який закріплений за діючою групою або гуртком'
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

const staffService = new StaffService();

module.exports = { StaffService, staffService };
