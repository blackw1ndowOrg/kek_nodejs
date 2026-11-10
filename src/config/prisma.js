const { AsyncLocalStorage } = require('node:async_hooks');
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;
const transactionStorage = new AsyncLocalStorage();

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

          const txContext = transactionStorage.getStore();
          const clientProp = toClientModelName(model);
          const readerClient =
            typeof txContext?.tx?.[clientProp]?.findUnique === 'function'
              ? txContext.tx
              : baseClient;
          let beforeState = null;

          if (
            (operation === 'update' || operation === 'delete' || operation === 'upsert') &&
            args?.where
          ) {
            try {
              if (typeof readerClient?.[clientProp]?.findUnique === 'function') {
                beforeState = await readerClient[clientProp].findUnique({
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

          const historyEntry = {
            entityName: model,
            entityId,
            action: operation,
            beforeState: safeJsonSerialize(finalBeforeState),
            afterState: safeJsonSerialize(afterState),
          };

          // Якщо операція виконується в межах інтерактивної транзакції — буферизуємо запис
          // до моменту успішного завершення транзакції, щоб уникнути фантомних записів при rollback
          if (Array.isArray(txContext?.pendingHistory)) {
            txContext.pendingHistory.push(historyEntry);
            return result;
          }

          try {
            if (typeof baseClient.stateHistory?.create === 'function') {
              await baseClient.stateHistory.create({
                data: historyEntry,
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

function wrapTransactionWithStateHistory(extendedClient, baseClient) {
  if (typeof extendedClient?.$transaction !== 'function') {
    return extendedClient;
  }

  const originalTransaction = extendedClient.$transaction.bind(extendedClient);

  extendedClient.$transaction = async function (arg, options) {
    if (typeof arg !== 'function') {
      return originalTransaction(arg, options);
    }

    const pendingHistory = [];

    return originalTransaction(async (tx) => {
      const result = await transactionStorage.run({ tx, pendingHistory }, () => arg(tx));

      const historyClient = typeof tx?.stateHistory?.create === 'function' ? tx : baseClient;

      if (typeof historyClient?.stateHistory?.create === 'function') {
        for (const entry of pendingHistory) {
          try {
            await historyClient.stateHistory.create({ data: entry });
          } catch (historyErr) {
            console.error(
              `[StateHistory Error] ${entry.entityName}.${entry.action}:`,
              historyErr.message
            );
          }
        }
      }

      return result;
    }, options);
  };

  return extendedClient;
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

  const extendedClient = baseClient.$extends(createStateHistoryExtension(baseClient));
  return wrapTransactionWithStateHistory(extendedClient, baseClient);
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
  wrapTransactionWithStateHistory,
  transactionStorage,
};
