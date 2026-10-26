const { BadRequestError, ConflictError, NotFoundError } = require('../../errors/AppError');
const { settingsService } = require('../settings/settings.service');
const { roomsRepository } = require('./rooms.repository');

// Prisma error codes
const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const VALUE_OUT_OF_RANGE = 'P2020';
const RECORD_NOT_FOUND = 'P2025';

function translateDbError(error) {
  if (error?.code === UNIQUE_VIOLATION)
    return new ConflictError('Кімната з такою назвою вже існує');
  if (error?.code === FOREIGN_KEY_VIOLATION)
    return new ConflictError('Кімната використовується і не може бути видалена');
  if (error?.code === VALUE_OUT_OF_RANGE)
    return new BadRequestError('Значення виходить за межі допустимого діапазону');
  if (error?.code === RECORD_NOT_FOUND)
    return new NotFoundError('Кімнату з таким ID не знайдено');
  return error;
}

class RoomsService {
  constructor(repository = roomsRepository, settings = settingsService) {
    this.repository = repository;
    this.settings = settings;
  }

  async list(filters) {
    return this.repository.findMany(filters);
  }

  async getById(id) {
    const room = await this.repository.findById(id);
    if (!room) {
      throw new NotFoundError('Кімнату з таким ID не знайдено');
    }
    return room;
  }

  /** Rooms are capped by DEFAULT_ROOMS_COUNT; missing monthlyCost falls back to the setting */
  async create(data) {
    const limit = this.settings.get('DEFAULT_ROOMS_COUNT');
    if ((await this.repository.count()) >= limit) {
      throw new ConflictError(`Досягнуто ліміту кількості кімнат (${limit})`);
    }
    const payload = {
      ...data,
      monthlyCost: data.monthlyCost ?? this.settings.get('ROOM_MONTHLY_COST'),
    };
    try {
      return await this.repository.create(payload);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /** The type of a room used by a group or a club cannot be changed */
  async update(id, data) {
    if (data.type !== undefined) {
      const room = await this.getById(id);
      if (data.type !== room.type && (room.group || room.club)) {
        throw new ConflictError('Неможливо змінити тип: кімната закріплена за групою або гуртком');
      }
    }
    try {
      return await this.repository.update(id, data);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /** A room used by a group or a club cannot be deleted */
  async remove(id) {
    const room = await this.getById(id);
    if (room.group || room.club) {
      throw new ConflictError('Кімната використовується і не може бути видалена');
    }
    try {
      await this.repository.delete(id);
    } catch (error) {
      throw translateDbError(error);
    }
  }
}

const roomsService = new RoomsService();

module.exports = { RoomsService, roomsService, translateDbError };
