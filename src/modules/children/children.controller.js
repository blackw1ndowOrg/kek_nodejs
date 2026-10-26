const { StatusCodes } = require('http-status-codes');
const { childrenService } = require('./children.service');

class ChildrenController {
  constructor(service = childrenService) {
    this.service = service;
  }

  list = async (req, res) => {
    const children = await this.service.list(req.user, req.query);
    res.status(StatusCodes.OK).json({ children });
  };

  getById = async (req, res) => {
    const child = await this.service.getById(req.user, req.params.id);
    res.status(StatusCodes.OK).json({ child });
  };

  create = async (req, res) => {
    const child = await this.service.create(req.user, req.body);
    res.status(StatusCodes.CREATED).json({ child });
  };

  update = async (req, res) => {
    const child = await this.service.update(req.user, req.params.id, req.body);
    res.status(StatusCodes.OK).json({ child });
  };

  deactivate = async (req, res) => {
    await this.service.deactivate(req.user, req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const childrenController = new ChildrenController();

module.exports = { ChildrenController, childrenController };
