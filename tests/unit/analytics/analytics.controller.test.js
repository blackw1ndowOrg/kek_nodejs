const { StatusCodes } = require('http-status-codes');
const {
  AnalyticsController,
  analyticsController,
} = require('../../../src/modules/analytics/analytics.controller');

describe('AnalyticsController', () => {
  let mockService;
  let controller;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockService = {
      getGroupProfit: jest.fn(),
      getTotalProfit: jest.fn(),
      calculateOptimalForecast: jest.fn(),
    };
    controller = new AnalyticsController(mockService);
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test('експортує дефолтний екземпляр analyticsController', () => {
    expect(analyticsController).toBeInstanceOf(AnalyticsController);
  });

  describe('getGroupProfit', () => {
    test('викликає service.getGroupProfit та повертає статус 200 із результатом', async () => {
      mockReq.params.id = 5;
      const profitData = { groupId: 5, profit: { uah: 10000 } };
      mockService.getGroupProfit.mockResolvedValue(profitData);

      await controller.getGroupProfit(mockReq, mockRes);

      expect(mockService.getGroupProfit).toHaveBeenCalledWith(5, mockReq.query);
      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockRes.json).toHaveBeenCalledWith(profitData);
    });
  });

  describe('getTotalProfit', () => {
    test('викликає service.getTotalProfit та повертає статус 200 із результатом', async () => {
      const totalData = { netProfit: { uah: 50000 } };
      mockService.getTotalProfit.mockResolvedValue(totalData);

      await controller.getTotalProfit(mockReq, mockRes);

      expect(mockService.getTotalProfit).toHaveBeenCalledWith(mockReq.query);
      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockRes.json).toHaveBeenCalledWith(totalData);
    });
  });

  describe('getForecast', () => {
    test('викликає service.calculateOptimalForecast та повертає статус 200 із трьома секціями', async () => {
      mockReq.body = { targetChildrenCount: 150 };
      const forecastData = {
        recommended: { groupsCount: 8, netProfit: { uah: 140000 } },
        strategies: { maxProfit: {}, comfortQuality: {}, minimalInfrastructure: {} },
        marginalEconomics: { marginalChild: {}, clubTeachersStatus: {}, expansionAnalysis: {} },
      };
      mockService.calculateOptimalForecast.mockResolvedValue(forecastData);

      await controller.getForecast(mockReq, mockRes);

      expect(mockService.calculateOptimalForecast).toHaveBeenCalledWith({
        targetChildrenCount: 150,
      });
      expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockRes.json).toHaveBeenCalledWith(forecastData);
    });
  });
});
