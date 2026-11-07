const { BadRequestError, ConflictError, NotFoundError } = require('../../errors/AppError');
const { clubsRepository } = require('./clubs.repository');

// Prisma error codes
const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

/** P2002 може прийти з трьох унікальних полів (name, roomId, teacherId): дивимось на meta.target */
function describeUniqueViolation(error) {
  const target = [].concat(error.meta?.target ?? []).join(',');
  if (target.includes('roomId')) return 'Кімната вже закріплена за іншим гуртком';
  if (target.includes('teacherId')) return 'Викладач вже веде інший гурток';
  return 'Гурток з такою назвою вже існує';
}

function translateDbError(error) {
  if (error?.code === UNIQUE_VIOLATION) return new ConflictError(describeUniqueViolation(error));
  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return new NotFoundError('Кімнату або викладача не знайдено');
  }
  if (error?.code === RECORD_NOT_FOUND) return new NotFoundError('Гурток не знайдено');
  return error;
}

class ClubsService {
  constructor(repository = clubsRepository) {
    this.repository = repository;
  }

  async list() {
    return this.repository.findMany();
  }

  async getById(id) {
    const club = await this.repository.findById(id);
    if (!club) {
      throw new NotFoundError('Гурток не знайдено');
    }
    return club;
  }

  /** Кімнату можна взяти лише типу CLUB і лише вільну */
  async assertRoomAvailable(roomId) {
    const room = await this.repository.findRoom(roomId);
    if (!room) {
      throw new NotFoundError('Кімнату не знайдено');
    }
    if (room.type !== 'CLUB') {
      throw new BadRequestError('Для гуртка потрібна кімната типу CLUB');
    }
    if (room.group || room.club) {
      throw new ConflictError('Кімната вже зайнята групою або іншим гуртком');
    }
  }

  /** Викладач має бути типу CLUB_TEACHER, активним і не вести інший гурток */
  async assertTeacherAvailable(teacherId) {
    const staff = await this.repository.findStaff(teacherId);
    if (!staff) {
      throw new NotFoundError('Працівника не знайдено');
    }
    if (staff.type !== 'CLUB_TEACHER') {
      throw new BadRequestError('Гурток може вести лише працівник типу CLUB_TEACHER');
    }
    if (!staff.isActive) {
      throw new BadRequestError('Працівник звільнений');
    }
    if (staff.clubTaught) {
      throw new ConflictError('Цей викладач вже веде інший гурток');
    }
  }

  async create(data) {
    await this.assertRoomAvailable(data.roomId);
    await this.assertTeacherAvailable(data.teacherId);
    try {
      return await this.repository.create(data);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /** Кімнату й викладача перевіряємо лише якщо вони справді змінюються */
  async update(id, data) {
    const club = await this.getById(id);
    if (data.roomId !== undefined && data.roomId !== club.room.id) {
      await this.assertRoomAvailable(data.roomId);
    }
    if (data.teacherId !== undefined && data.teacherId !== club.teacher.id) {
      await this.assertTeacherAvailable(data.teacherId);
    }
    try {
      return await this.repository.update(id, data);
    } catch (error) {
      throw translateDbError(error);
    }
  }

  /** Гурток видаляється, а його слоти розкладу перетворюються на FREE_PLAY (див. репозиторій) */
  async remove(id) {
    await this.getById(id);
    try {
      await this.repository.delete(id);
    } catch (error) {
      throw translateDbError(error);
    }
  }
}

const clubsService = new ClubsService();

module.exports = { ClubsService, clubsService, translateDbError };
