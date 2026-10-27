const request = require('supertest');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');
const { ErrorCodes } = require('../../src/errors/errorCodes');

describe('app', () => {
  const app = createApp();

  test('GET /api/v1/health -> 200', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('невідомий маршрут -> 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
  });

  test('зламаний JSON -> 400', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.BAD_REQUEST);
  });
});
