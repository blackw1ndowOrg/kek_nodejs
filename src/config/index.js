const DEFAULT_PORT = 3000;
const DEFAULT_JWT_SECRET = 'duzhe-potuzhnyi-meha-token-change-in-prod';
const DEFAULT_JWT_EXPIRES_IN = '30m';

const config = {
  port: Number(process.env.PORT) || DEFAULT_PORT,
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
};

module.exports = {
  config,
  DEFAULT_PORT,
  DEFAULT_JWT_SECRET,
  DEFAULT_JWT_EXPIRES_IN,
};
