const { StatusCodes } = require('http-status-codes');
const { parentsService } = require('./parents.service');

class ParentsController {
  constructor(service = parentsService) {
    this.service = service;
  }

  create = async (req, res) => {
    const parent = await this.service.createParent(req.body);
    res.status(StatusCodes.CREATED).json(parent);
  };

  getAll = async (req, res) => {
    const parents = await this.service.getAllParents(req.query);
    res.status(StatusCodes.OK).json({ parents });
  };

  getById = async (req, res) => {
    const parent = await this.service.getParentById(req.params.id);
    res.status(StatusCodes.OK).json(parent);
  };

  update = async (req, res) => {
    const parent = await this.service.updateParent(req.params.id, req.body);
    res.status(StatusCodes.OK).json(parent);
  };

  delete = async (req, res) => {
    await this.service.deleteParent(req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const parentsController = new ParentsController();

module.exports = { ParentsController, parentsController };
