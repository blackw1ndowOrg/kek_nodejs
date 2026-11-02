const { StatusCodes } = require('http-status-codes');
const { ErrorCodes } = require('./errorCodes');

class AppError extends Error {
  constructor(
    message,
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    code = ErrorCodes.INTERNAL_ERROR,
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    if (details) {
      this.details = details;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', code = ErrorCodes.BAD_REQUEST, details = null) {
    super(message, StatusCodes.BAD_REQUEST, code, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = ErrorCodes.UNAUTHORIZED) {
    super(message, StatusCodes.UNAUTHORIZED, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = ErrorCodes.FORBIDDEN) {
    super(message, StatusCodes.FORBIDDEN, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not Found', code = ErrorCodes.NOT_FOUND) {
    super(message, StatusCodes.NOT_FOUND, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', code = ErrorCodes.CONFLICT) {
    super(message, StatusCodes.CONFLICT, code);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
