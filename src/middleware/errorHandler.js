const { StatusCodes, getReasonPhrase } = require('http-status-codes');
const { ErrorCodes } = require('../errors/errorCodes');

function errorHandler(err, _req, res, _next) {
  if (err.name === 'ZodError') {
    const issues = Array.isArray(err.issues) ? err.issues : [];
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: issues.map((issue) => ({
          path: Array.isArray(issue.path) ? issue.path.join('.') : '',
          message: issue.message,
        })),
      },
    });
  }

  const status = err.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
  const isServerError = status >= StatusCodes.INTERNAL_SERVER_ERROR;
  const code = err.code ?? (isServerError ? ErrorCodes.INTERNAL_ERROR : ErrorCodes.BAD_REQUEST);
  const message = isServerError ? getReasonPhrase(status) : err.message;

  const errorResponse = { code, message };
  if (err.details !== undefined && err.details !== null) {
    errorResponse.details = err.details;
  }

  return res.status(status).json({ error: errorResponse });
}

module.exports = { errorHandler };
