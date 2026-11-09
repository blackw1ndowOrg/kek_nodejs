const { prisma } = require('../../src/config/prisma');
const { withActor } = require('../../src/config/audit');
const { absencesRepository } = require('../../src/modules/absences/absences.repository');
const { childrenRepository } = require('../../src/modules/children/children.repository');

// Історія змін на справжній PostgreSQL: тригери з міграції add_audit_log.
// Без бази тести пропускаються (як і інші *.db.test.js).

const NOT_AUDITED = ['AuditLog', '_prisma_migrations'];

const historyOf = (tableName, recordId) =>
  prisma.auditLog.findMany({
    where: { tableName, recordId: String(recordId) },
    orderBy: { id: 'asc' },
  });

describe('Історія змін (AuditLog, справжня PostgreSQL)', () => {
  let isDbConnected = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch {
      console.warn('[Real DB Tests] PostgreSQL is not reachable, skipping live DB tests.');
    }
  });

  afterAll(async () => {
    if (isDbConnected) {
      await prisma.$disconnect();
    }
  });

  const runIfDb = (name, fn) => {
    test(name, async () => {
      if (!isDbConnected) {
        return;
      }
      await fn();
    });
  };

  runIfDb(
    'кожна таблиця має тригер історії (нова таблиця без enable_audit — помилка)',
    async () => {
      const tables = await prisma.$queryRaw`
      SELECT c.relname::text AS name,
             EXISTS (
               SELECT 1 FROM pg_trigger t
               WHERE t.tgrelid = c.oid AND t.tgname = 'audit_row_change'
             ) AS audited
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
      const missing = tables
        .filter((table) => !NOT_AUDITED.includes(table.name) && !table.audited)
        .map((table) => table.name);
      expect(missing).toEqual([]);
      expect(tables.length).toBeGreaterThan(NOT_AUDITED.length);
    }
  );

  runIfDb(
    'відсутність: створення і скасування з автором; стан до видалення зберігається',
    async () => {
      const child = await prisma.child.findFirst({ where: { isActive: true } });
      const user = await prisma.user.findFirst();
      const notifiedAt = new Date();
      const absence = await absencesRepository.create(
        { childId: child.id, date: '2030-01-07', notifiedAt },
        user.id
      );
      await absencesRepository.delete(absence.id, user.id);

      const history = await historyOf('Absence', absence.id);
      expect(history.map((row) => row.action)).toEqual(['INSERT', 'DELETE']);
      expect(history.every((row) => row.actorUserId === user.id)).toBe(true);
      expect(history[0].oldData).toBeNull();
      expect(history[0].newData).toMatchObject({ childId: child.id, date: '2030-01-07' });
      expect(history[1].oldData).toMatchObject({ id: absence.id, childId: child.id });
      expect(history[1].newData).toBeNull();
      expect(history[0].txId).not.toBe(history[1].txId);
    }
  );

  runIfDb('UPDATE: лише змінені колонки; зміна без withActor — автор невідомий', async () => {
    const child = await prisma.child.findFirst({ where: { isActive: true } });
    await prisma.child.update({ where: { id: child.id }, data: { notes: 'QA: історія змін' } });
    await prisma.child.update({ where: { id: child.id }, data: { notes: child.notes } });

    const [first, second] = (await historyOf('Child', child.id)).slice(-2);
    expect(first.action).toBe('UPDATE');
    expect(first.changedColumns).toEqual(['notes', 'updatedAt']);
    expect(first.oldData.notes).toBe(child.notes);
    expect(first.newData.notes).toBe('QA: історія змін');
    expect(first.actorUserId).toBeNull();
    expect(second.newData.notes).toBe(child.notes);
  });

  runIfDb('зміна дитини через репозиторій — з автором', async () => {
    const child = await prisma.child.findFirst({ where: { isActive: true } });
    const user = await prisma.user.findFirst();
    await childrenRepository.update(child.id, { notes: 'QA: автор зміни' }, user.id);
    await childrenRepository.update(child.id, { notes: child.notes }, user.id);

    const [changed, restored] = (await historyOf('Child', child.id)).slice(-2);
    expect(changed).toMatchObject({ action: 'UPDATE', actorUserId: user.id });
    expect(changed.newData.notes).toBe('QA: автор зміни');
    expect(restored.newData.notes).toBe(child.notes);
  });

  runIfDb('пароль не потрапляє в історію, але сам факт зміни видно', async () => {
    const user = await withActor(prisma, 1, (tx) =>
      tx.user.create({
        data: { email: `audit-${Date.now()}@kg.test`, passwordHash: 'secret-hash', role: 'PARENT' },
      })
    );
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: 'new-secret-hash' } });
    await prisma.user.delete({ where: { id: user.id } });

    const history = await historyOf('User', user.id);
    expect(history.map((row) => row.action)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    expect(history[0].actorUserId).toBe(1);
    expect(history[1].changedColumns).toContain('passwordHash');
    const snapshots = JSON.stringify(history.map((row) => [row.oldData, row.newData]));
    expect(snapshots).not.toContain('secret-hash');
    expect(snapshots).not.toContain('passwordHash');
  });

  // історії INSERT не мають — вона починається з першої зміни після міграції
  runIfDb('складений ключ ParentChild записується як "parentId:childId"', async () => {
    const parent = await prisma.parent.create({
      data: { fullName: 'QA Історія', phone: '+380000000000' },
    });
    const child = await prisma.child.findFirst();
    await prisma.parentChild.create({ data: { parentId: parent.id, childId: child.id } });
    await prisma.parent.delete({ where: { id: parent.id } }); // каскадом видаляє і зв'язок

    const history = await historyOf('ParentChild', `${parent.id}:${child.id}`);
    expect(history.map((row) => row.action)).toEqual(['INSERT', 'DELETE']);
    expect(history[1].oldData).toEqual({ parentId: parent.id, childId: child.id });
  });

  runIfDb('історію не можна змінити чи видалити', async () => {
    const [row] = await prisma.auditLog.findMany({ take: 1 });
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { tableName: 'X' } })
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});
