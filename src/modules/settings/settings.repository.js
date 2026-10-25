const { prisma } = require('../../config/prisma');

class SettingsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  async findAll() {
    return this.db.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async update(key, value) {
    return this.db.setting.update({ where: { key }, data: { value } });
  }

  async upsert(key, value) {
    return this.db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

const settingsRepository = new SettingsRepository();

module.exports = { SettingsRepository, settingsRepository };
