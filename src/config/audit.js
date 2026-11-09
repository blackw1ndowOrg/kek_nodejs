// Історія змін ведеться тригерами PostgreSQL (міграція add_audit_log): кожен INSERT, UPDATE і DELETE
// у будь-якій таблиці потрапляє в "AuditLog". Щоб у записі історії було видно, ХТО зробив зміну,
// запис має йти через withActor: він ставить app.actor_id на час транзакції, а тригер його читає.

/**
 * Виконує fn(tx) в одній транзакції від імені користувача.
 * Усі записи в fn потрапляють в "AuditLog" з actorUserId = actorUserId.
 *
 * @template T
 * @param {object} db клієнт Prisma
 * @param {number} actorUserId User.id того, хто робить зміну
 * @param {(tx: object) => Promise<T>} fn записи через tx, а не через db
 * @returns {Promise<T>}
 */
async function withActor(db, actorUserId, fn) {
  return db.$transaction(async (tx) => {
    // true — налаштування діє лише до кінця цієї транзакції, тож не «протече» в інший запит з пулу
    await tx.$executeRaw`SELECT set_config('app.actor_id', ${String(actorUserId)}, true)`;
    return fn(tx);
  });
}

module.exports = { withActor };
