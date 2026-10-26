const { StatusCodes } = require('http-status-codes');
const { staffService } = require('./staff.service');

class StaffController {
  constructor(service = staffService) {
    this.service = service;
  }

  create = async (req, res) => {
    const staff = await this.service.createStaff(req.body);
    res.status(StatusCodes.CREATED).json(staff);
  };

  getAll = async (req, res) => {
    const staff = await this.service.getAllStaff(req.query);
    res.status(StatusCodes.OK).json({ staff });
  };

  getById = async (req, res) => {
    const staff = await this.service.getStaffById(req.params.id);
    res.status(StatusCodes.OK).json(staff);
  };

  update = async (req, res) => {
    const staff = await this.service.updateStaff(req.params.id, req.body);
    res.status(StatusCodes.OK).json(staff);
  };

  delete = async (req, res) => {
    await this.service.deleteStaff(req.params.id);
    res.status(StatusCodes.NO_CONTENT).send();
  };
}

const staffController = new StaffController();

module.exports = { StaffController, staffController };
