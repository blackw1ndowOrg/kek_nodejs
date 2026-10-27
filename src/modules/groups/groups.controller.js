const { StatusCodes } = require('http-status-codes');
const { groupsService } = require('./groups.service');

// Лише HTTP: дістає дані із запиту (вже провалідовані Zod) і повертає статус. Логіка — у сервісі.
class GroupsController {
  constructor(service = groupsService) {
    this.service = service;
  }

  list = async (req, res) => {
    const groups = await this.service.list(req.user, req.query);
    res.status(StatusCodes.OK).json({ groups });
  };

  getById = async (req, res) => {
    const group = await this.service.getById(req.user, req.params.id);
    res.status(StatusCodes.OK).json(group);
  };

  create = async (req, res) => {
    const group = await this.service.create(req.body);
    res.status(StatusCodes.CREATED).json(group);
  };

  update = async (req, res) => {
    const group = await this.service.update(req.params.id, req.body);
    res.status(StatusCodes.OK).json(group);
  };

  delete = async (req, res) => {
    await this.service.delete(req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };

  enrollChild = async (req, res) => {
    await this.service.enrollChild(req.params.id, req.body.childId);
    res.status(StatusCodes.NO_CONTENT).send();
  };

  unenrollChild = async (req, res) => {
    await this.service.unenrollChild(req.params.id, req.params.childId);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const groupsController = new GroupsController();

module.exports = { GroupsController, groupsController };
