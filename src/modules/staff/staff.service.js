const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/prisma');
const { NotFoundError, ConflictError } = require('../../errors/AppError');
const {
  educatorSalary,
  assistantSalary,
  clubTeacherSalary,
  managerSalary,
} = require('../../domain/salary');
const { staffRepository } = require('./staff.repository');
const { settingsService } = require('../settings/settings.service');

class StaffService {
  constructor(repository = staffRepository, db = prisma, settings = settingsService) {
    this.repository = repository;
    this.db = db;
    this.settings = settings;
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

    // Захист: заборона деактивації закріпленого вихователя/помічника/викладача гуртка
    if (
      updateData.isActive === false &&
      (existing.educatorOf || existing.assistantOf || existing.clubTaught)
    ) {
      throw new ConflictError(
        'Неможливо деактивувати співробітника, закріпленого за діючою групою або гуртком'
      );
    }

    // Захист: заборона зміни посади співробітника, закріпленого за діючою групою або гуртком
    if (
      updateData.type &&
      updateData.type !== existing.type &&
      (existing.educatorOf || existing.assistantOf || existing.clubTaught)
    ) {
      throw new ConflictError(
        'Неможливо змінити посаду співробітника, закріпленого за діючою групою або гуртком'
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
        if (updated.user) {
          updated.user.role = newRole;
        }
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

  async getStaffSalary(id) {
    const staff = await this.repository.findById(id);
    if (!staff) {
      throw new NotFoundError('Працівника з таким ID не знайдено');
    }

    if (!staff.isActive) {
      return {
        staffId: staff.id,
        fullName: staff.fullName,
        type: staff.type,
        salary: 0,
        isActive: false,
      };
    }

    let salary;
    let childrenCount = null;
    let groupName = null;

    switch (staff.type) {
      case 'EDUCATOR': {
        childrenCount = staff.educatorOf?.children?.length || 0;
        groupName = staff.educatorOf?.name || null;
        const ratePerChild = this.settings.get('EDUCATOR_PER_CHILD');
        const extraPay = this.settings.get('EDUCATOR_EXTRA_PAY');
        const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
        salary = educatorSalary(childrenCount, ratePerChild, extraPay, threshold);
        break;
      }
      case 'ASSISTANT': {
        childrenCount = staff.assistantOf?.children?.length || 0;
        groupName = staff.assistantOf?.name || null;
        const baseSalary = this.settings.get('ASSISTANT_SALARY');
        const extraPay = this.settings.get('ASSISTANT_EXTRA_PAY');
        const threshold = this.settings.get('GROUP_EXTRA_PAY_THRESHOLD');
        salary = assistantSalary(childrenCount, baseSalary, extraPay, threshold);
        break;
      }
      case 'CLUB_TEACHER': {
        const clubSalary = this.settings.get('CLUB_TEACHER_SALARY');
        salary = clubTeacherSalary(clubSalary);
        break;
      }
      case 'MANAGER': {
        const mgrSalary = this.settings.get('MANAGER_SALARY');
        salary = managerSalary(mgrSalary);
        break;
      }
      default:
        salary = 0;
    }

    return {
      staffId: staff.id,
      fullName: staff.fullName,
      type: staff.type,
      salary,
      isActive: staff.isActive,
      details: {
        childrenCount,
        groupName,
      },
    };
  }
}

const staffService = new StaffService();

module.exports = { StaffService, staffService };
