module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/src/server.js', '<rootDir>/src/config/prisma.js'],
  coverageThreshold: {
    global: { statements: 95, branches: 95, functions: 95, lines: 95 },
  },
  coverageReporters: ['text', 'text-summary', 'lcov'],
  setupFiles: ['dotenv/config'],
};