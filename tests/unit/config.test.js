describe('config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('бере порт з PORT', () => {
    process.env.PORT = '4000';
    expect(require('../../src/config').config.port).toBe(4000);
  });

  test('без PORT — порт за замовчуванням', () => {
    delete process.env.PORT;
    const { config, DEFAULT_PORT } = require('../../src/config');
    expect(config.port).toBe(DEFAULT_PORT);
  });

  test('бере jwtSecret та jwtExpiresIn зі змінних середовища', () => {
    process.env.JWT_SECRET = 'custom-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    const { config } = require('../../src/config');
    expect(config.jwtSecret).toBe('custom-secret');
    expect(config.jwtExpiresIn).toBe('1h');
  });

  test('без змінних JWT — дефолтні значення', () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    const { config, DEFAULT_JWT_SECRET, DEFAULT_JWT_EXPIRES_IN } = require('../../src/config');
    expect(config.jwtSecret).toBe(DEFAULT_JWT_SECRET);
    expect(config.jwtExpiresIn).toBe(DEFAULT_JWT_EXPIRES_IN);
  });
});
