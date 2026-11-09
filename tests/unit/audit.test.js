const { withActor } = require('../../src/config/audit');

function createDb() {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
  const db = { $transaction: jest.fn(async (fn) => fn(tx)) };
  return { db, tx };
}

describe('withActor', () => {
  test('ставить app.actor_id на час транзакції і виконує fn у ній же', async () => {
    const { db, tx } = createDb();
    const fn = jest.fn().mockResolvedValue('result');

    await expect(withActor(db, 16, fn)).resolves.toBe('result');

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const [strings, value] = tx.$executeRaw.mock.calls[0];
    expect(strings.join('?')).toBe("SELECT set_config('app.actor_id', ?, true)");
    expect(value).toBe('16');
    expect(fn).toHaveBeenCalledWith(tx);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(fn.mock.invocationCallOrder[0]);
  });

  test('помилка у fn відкочує транзакцію і прокидається далі', async () => {
    const { db } = createDb();
    const error = new Error('boom');
    await expect(withActor(db, 1, () => Promise.reject(error))).rejects.toBe(error);
  });
});
