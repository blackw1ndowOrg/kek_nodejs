const request = require('supertest');
const { StatusCodes } = require('http-status-codes');
const { createApp } = require('../../src/app');

describe('Swagger Documentation (GET /api/docs)', () => {
  const app = createApp();

  test('повертає 200 OK та HTML сторінку Swagger UI за адресою /api/docs/', async () => {
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(StatusCodes.OK);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('swagger-ui');
  });

  test('перенаправляє або повертає 200 при зверненні до /api/docs без слеша', async () => {
    const res = await request(app).get('/api/docs');

    // swagger-ui-express робить redirect на /api/docs/ (301) або одразу повертає 200
    expect([StatusCodes.OK, StatusCodes.MOVED_PERMANENTLY]).toContain(res.status);
  });
});
