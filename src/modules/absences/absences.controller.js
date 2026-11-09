const { StatusCodes } = require('http-status-codes');
const { absencesService } = require('./absences.service');

class AbsencesController {
  constructor(service = absencesService) {
    this.service = service;
  }

  create = async (req, res) => {
    const absence = await this.service.create(req.user, req.params.childId, req.body.date);
    res.status(StatusCodes.CREATED).json(absence);
  };

  list = async (req, res) => {
    const result = await this.service.list(req.user, req.params.childId, req.query.month);
    res.status(StatusCodes.OK).json(result);
  };

  remove = async (req, res) => {
    await this.service.remove(req.user, req.params.childId, req.params.absenceId);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const absencesController = new AbsencesController();

module.exports = { AbsencesController, absencesController };
