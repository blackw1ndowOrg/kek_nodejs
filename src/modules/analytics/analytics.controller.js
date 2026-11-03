const { StatusCodes } = require('http-status-codes');
const { analyticsService } = require('./analytics.service');

class AnalyticsController {
  constructor(service = analyticsService) {
    this.service = service;
  }

  getGroupProfit = async (req, res) => {
    const result = await this.service.getGroupProfit(req.params.id, req.query);
    res.status(StatusCodes.OK).json(result);
  };

  getTotalProfit = async (req, res) => {
    const result = await this.service.getTotalProfit(req.query);
    res.status(StatusCodes.OK).json(result);
  };

  getForecast = async (req, res) => {
    const result = await this.service.calculateOptimalForecast(req.body);
    res.status(StatusCodes.OK).json(result);
  };
}

const analyticsController = new AnalyticsController();

module.exports = {
  AnalyticsController,
  analyticsController,
};
