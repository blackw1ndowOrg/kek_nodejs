const { ConflictError, NotFoundError } = require('../../errors/AppError');
const { roomsRepository } = require('./rooms.repository');

// Prisma error codes
const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

function translateDbError(error) {
  if (error?.code === UNIQUE_VIOLATION)
    return new ConflictError('Room with this name already exists');
  if (error?.code === FOREIGN_KEY_VIOLATION)
    return new ConflictError('Room is in use and cannot be deleted');
  if (error?.code === RECORD_NOT_FOUND) return new NotFoundError('Room not found');
  return error;
}

class RoomsService {
  constructor(repository = roomsRepository) {
    this.repository = repository;
  }

  async list(filters) {
    return this.repository.findMany(filters);
  }

  async getById(id) {
    const room = await this.repository.findById(id);
    if (!room) {
      throw new NotFoundError('Room not found');
    }
    return room;
  }

  async create(data) {
    try {
      return await this.repository.create(data);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  async update(id, data) {
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
      throw new ConflictError('Room is in use and cannot be deleted');
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
