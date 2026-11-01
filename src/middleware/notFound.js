const { StatusCodes } = require('http-status-codes');
const { ErrorCodes } = require('../errors/errorCodes');

function notFound(_req, res) {
  res
    .status(StatusCodes.NOT_FOUND)
    .json({ error: { code: ErrorCodes.NOT_FOUND, message: 'Route not found' } });
}

module.exports = { notFound };
