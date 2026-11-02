const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

function createClient() {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' },
    ],
  });

  if (process.env.NODE_ENV !== 'production') {
    client.$on('query', (e) => {
      console.log(`[prisma] ${e.query} | params=${e.params} | ${e.duration}ms`);
    });
  }

  return client;
}

const prisma = globalForPrisma.__prisma || createClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = { prisma };
