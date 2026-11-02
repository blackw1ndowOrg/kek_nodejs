const { StatusCodes } = require('http-status-codes');
const { scheduleService } = require('./schedule.service');

class ScheduleController {
  constructor(service = scheduleService) {
    this.service = service;
  }

  generate = async (_req, res) => {
    const result = await this.service.generate();
    res.status(StatusCodes.CREATED).json(result);
  };

  getGroup = async (req, res) => {
    const result = await this.service.getGroupSchedule(req.user, req.params.groupId);
    res.status(StatusCodes.OK).json(result);
  };

  getMine = async (req, res) => {
    const slots = await this.service.getMySchedule(req.user);
    res.status(StatusCodes.OK).json({ slots });
  };

  updateSlot = async (req, res) => {
    const slot = await this.service.updateSlot(req.params.id, req.body);
    res.status(StatusCodes.OK).json(slot);
  };

  clearGroup = async (req, res) => {
    await this.service.clearGroup(req.params.groupId);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const scheduleController = new ScheduleController();

module.exports = { ScheduleController, scheduleController };
