const { StatusCodes } = require('http-status-codes');
const { roomsService } = require('./rooms.service');

class RoomsController {
  constructor(service = roomsService) {
    this.service = service;
  }

  list = async (req, res) => {
    const rooms = await this.service.list({ type: req.query.type });
    res.status(StatusCodes.OK).json({ rooms });
  };

  getById = async (req, res) => {
    const room = await this.service.getById(req.params.id);
    res.status(StatusCodes.OK).json({ room });
  };

  create = async (req, res) => {
    const room = await this.service.create(req.body);
    res.status(StatusCodes.CREATED).json({ room });
  };

  update = async (req, res) => {
    const room = await this.service.update(req.params.id, req.body);
    res.status(StatusCodes.OK).json({ room });
  };

  remove = async (req, res) => {
    await this.service.remove(req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const roomsController = new RoomsController();

module.exports = { RoomsController, roomsController };
