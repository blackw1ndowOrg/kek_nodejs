const { StatusCodes } = require('http-status-codes');
const { billingService } = require('./billing.service');

class BillingController {
  constructor(service = billingService) {
    this.service = service;
  }

  getChildBilling = async (req, res) => {
    const result = await this.service.getChildBilling(req.user, req.params.childId);
    res.status(StatusCodes.OK).json(result);
  };

  pay = async (req, res) => {
    const result = await this.service.payForChild(req.user, req.params.childId, req.body?.plan);
    res.status(StatusCodes.CREATED).json(result);
  };
}

const billingController = new BillingController();

module.exports = { BillingController, billingController };
