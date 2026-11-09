const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

function toClientModelName(model) {
  if (!model) return '';
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function extractEntityId(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.id !== undefined && data.id !== null) {
    return String(data.id);
  }
  if (data.key !== undefined && data.key !== null) {
    return String(data.key);
  }
  if (data.parentId !== undefined && data.childId !== undefined) {
    return `${data.parentId}:${data.childId}`;
  }
  if (data.parentId_childId && typeof data.parentId_childId === 'object') {
    return `${data.parentId_childId.parentId}:${data.parentId_childId.childId}`;
  }
  return null;
}

function safeJsonSerialize(data) {
  if (!data || typeof data !== 'object') return null;
  try {
    return JSON.parse(
      JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  } catch {
    return null;
  }
}

function createStateHistoryExtension(baseClient) {
  return {
    name: 'StateHistoryExtension',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Захист від нескінченної рекурсії
          if (model === 'StateHistory') {
            return query(args);
          }

          const trackedOperations = ['create', 'update', 'delete', 'upsert'];
          if (!trackedOperations.includes(operation)) {
            return query(args);
          }

          const clientProp = toClientModelName(model);
          let beforeState = null;

          if (
            (operation === 'update' || operation === 'delete' || operation === 'upsert') &&
            args?.where
          ) {
            try {
              if (typeof baseClient[clientProp]?.findUnique === 'function') {
                beforeState = await baseClient[clientProp].findUnique({
                  where: args.where,
                });
              }
            } catch {
              // Ігноруємо помилки пошуку попереднього стану
            }
          }

          const result = await query(args);

          const afterState = operation === 'delete' ? null : result;
          const finalBeforeState =
            beforeState || (operation === 'delete' && result ? result : null);
          const entityId =
            extractEntityId(result) ||
            extractEntityId(beforeState) ||
            extractEntityId(args?.where) ||
            null;

          try {
            if (typeof baseClient.stateHistory?.create === 'function') {
              await baseClient.stateHistory.create({
                data: {
                  entityName: model,
                  entityId,
                  action: operation,
                  beforeState: safeJsonSerialize(finalBeforeState),
                  afterState: safeJsonSerialize(afterState),
                },
              });
            }
          } catch (historyErr) {
            console.error(`[StateHistory Error] ${model}.${operation}:`, historyErr.message);
          }

          return result;
        },
      },
    },
  };
}

function createClient() {
  const baseClient = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' },
    ],
  });

  if (process.env.NODE_ENV !== 'production') {
    baseClient.$on('query', (e) => {
      console.log(`[prisma] ${e.query} | params=${e.params} | ${e.duration}ms`);
    });
  }

  return baseClient.$extends(createStateHistoryExtension(baseClient));
}

const prisma = globalForPrisma.__prisma || createClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = {
  prisma,
  createClient,
  toClientModelName,
  extractEntityId,
  safeJsonSerialize,
  createStateHistoryExtension,
};
