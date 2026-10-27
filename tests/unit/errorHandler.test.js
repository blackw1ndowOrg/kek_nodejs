const { StatusCodes } = require('http-status-codes');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { ErrorCodes } = require('../../src/errors/errorCodes');
const { ConflictError, BadRequestError } = require('../../src/errors/AppError');

function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('errorHandler', () => {
  test('бізнес-помилка зі своїм кодом', () => {
    const res = fakeRes();
    const err = new ConflictError('Group is full');
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: ErrorCodes.CONFLICT, message: 'Group is full' },
    });
  });

  test('помилка ZodError перетворюється на 400 з валідаційними деталями', () => {
    const res = fakeRes();
    const zodError = {
      name: 'ZodError',
      issues: [
        { path: ['body', 'email'], message: 'Invalid email' },
        { path: ['body', 'password'], message: 'Too short' },
      ],
    };
    errorHandler(zodError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: [
          { path: 'body.email', message: 'Invalid email' },
          { path: 'body.password', message: 'Too short' },
        ],
      },
    });
  });

  test('ZodError з відсутніми або нестандартними issues', () => {
    const res = fakeRes();
    const zodError = {
      name: 'ZodError',
      issues: [{ path: null, message: 'Invalid format' }],
    };
    errorHandler(zodError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: [{ path: '', message: 'Invalid format' }],
      },
    });

    const emptyZodError = { name: 'ZodError' };
    const resEmpty = fakeRes();
    errorHandler(emptyZodError, {}, resEmpty, () => {});
    expect(resEmpty.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: [],
      },
    });
  });

  test('помилка з додатковим полем details', () => {
    const res = fakeRes();
    const err = new BadRequestError('Bad input', ErrorCodes.BAD_REQUEST, { field: 'name' });
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.BAD_REQUEST,
        message: 'Bad input',
        details: { field: 'name' },
      },
    });
  });

  test('помилка 4xx без коду використовує BAD_REQUEST за замовчуванням', () => {
    const res = fakeRes();
    const err = new Error('Custom 400 error');
    err.statusCode = StatusCodes.BAD_REQUEST;
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: ErrorCodes.BAD_REQUEST, message: 'Custom 400 error' },
    });
  });

  test('невідома помилка -> 500 без витоку тексту', () => {
    const res = fakeRes();
    errorHandler(new Error('db password is 123'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal Server Error' },
    });
  });

  test('серверна помилка (наприклад 503) без коду використовує назву статусу', () => {
    const res = fakeRes();
    const err = new Error('Database down');
    err.statusCode = StatusCodes.SERVICE_UNAVAILABLE;
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(StatusCodes.SERVICE_UNAVAILABLE);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Service Unavailable' },
    });
  });
});
