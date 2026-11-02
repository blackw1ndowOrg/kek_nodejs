const { StatusCodes } = require('http-status-codes');
const { clubsService } = require('./clubs.service');

class ClubsController {
  constructor(service = clubsService) {
    this.service = service;
  }

  list = async (_req, res) => {
    const clubs = await this.service.list();
    res.status(StatusCodes.OK).json({ clubs });
  };

  getById = async (req, res) => {
    const club = await this.service.getById(req.params.id);
    res.status(StatusCodes.OK).json(club);
  };

  create = async (req, res) => {
    const club = await this.service.create(req.body);
    res.status(StatusCodes.CREATED).json(club);
  };

  update = async (req, res) => {
    const club = await this.service.update(req.params.id, req.body);
    res.status(StatusCodes.OK).json(club);
  };

  remove = async (req, res) => {
    await this.service.remove(req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const clubsController = new ClubsController();

module.exports = { ClubsController, clubsController };
