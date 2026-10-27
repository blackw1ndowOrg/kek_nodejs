const {
  ROOM_TYPES,
  roomIdParams,
  listRoomsSchema,
  roomIdSchema,
  createRoomSchema,
  updateRoomSchema,
} = require('../../../src/modules/rooms/rooms.schema');

const MAX_COST = 1_000_000_000;

describe('ROOM_TYPES', () => {
  test('містить GROUP і CLUB', () => {
    expect(ROOM_TYPES).toEqual(['GROUP', 'CLUB']);
  });
});

describe('roomIdParams і roomIdSchema', () => {
  test('id з URL стає числом', () => {
    expect(roomIdParams.parse({ id: '4' })).toEqual({ id: 4 });
    expect(roomIdSchema.parse({ params: { id: '4' } })).toEqual({ params: { id: 4 } });
  });

  test.each(['abc', '0', '-1', '1.5', ''])('id %p -> помилка', (id) => {
    expect(roomIdSchema.safeParse({ params: { id } }).success).toBe(false);
  });

  test('повідомлення про помилку українською', () => {
    const result = roomIdSchema.safeParse({ params: { id: '-1' } });
    expect(result.error.issues[0].message).toBe('Некоректний id кімнати');
  });
});

describe('listRoomsSchema', () => {
  test('без фільтра', () => {
    expect(listRoomsSchema.parse({ query: {} })).toEqual({ query: {} });
  });

  test.each(ROOM_TYPES)('type %s -> валідно', (type) => {
    expect(listRoomsSchema.parse({ query: { type } })).toEqual({ query: { type } });
  });

  test.each(['OFFICE', 'group', ''])('type %p -> помилка', (type) => {
    expect(listRoomsSchema.safeParse({ query: { type } }).success).toBe(false);
  });
});

describe('createRoomSchema', () => {
  const valid = { name: 'Кімната 1', type: 'GROUP' };

  test('мінімальне тіло; пробіли в назві обрізано', () => {
    const { body } = createRoomSchema.parse({ body: { ...valid, name: '  Кімната 1  ' } });
    expect(body).toEqual(valid);
  });

  test('з вартістю', () => {
    const { body } = createRoomSchema.parse({ body: { ...valid, monthlyCost: 150000 } });
    expect(body.monthlyCost).toBe(150000);
  });

  test.each([0, MAX_COST])('межі вартості %i -> валідно', (monthlyCost) => {
    expect(createRoomSchema.safeParse({ body: { ...valid, monthlyCost } }).success).toBe(true);
  });

  test('назва рівно 100 символів -> валідно', () => {
    const name = 'а'.repeat(100);
    expect(createRoomSchema.safeParse({ body: { ...valid, name } }).success).toBe(true);
  });

  test.each([
    ['без назви', { type: 'GROUP' }],
    ['порожня назва', { ...valid, name: '   ' }],
    ['назва 101 символ', { ...valid, name: 'а'.repeat(101) }],
    ['назва не рядок', { ...valid, name: 5 }],
    ['без типу', { name: 'А' }],
    ['невідомий тип', { ...valid, type: 'OFFICE' }],
    ['вартість від’ємна', { ...valid, monthlyCost: -1 }],
    ['вартість дробова', { ...valid, monthlyCost: 10.5 }],
    ['вартість більша за максимум', { ...valid, monthlyCost: MAX_COST + 1 }],
    ['вартість рядком', { ...valid, monthlyCost: '100' }],
    ['невідоме поле', { ...valid, color: 'red' }],
  ])('%s -> помилка', (_name, body) => {
    expect(createRoomSchema.safeParse({ body }).success).toBe(false);
  });
});

describe('updateRoomSchema', () => {
  const params = { id: '3' };

  test.each([
    ['лише назва', { name: 'Нова' }],
    ['лише тип', { type: 'CLUB' }],
    ['лише вартість', { monthlyCost: 0 }],
    ['усі поля', { name: 'Нова', type: 'CLUB', monthlyCost: 1000 }],
  ])('%s -> валідно', (_name, body) => {
    expect(updateRoomSchema.safeParse({ params, body }).success).toBe(true);
  });

  test('id з URL стає числом, назва обрізається', () => {
    expect(updateRoomSchema.parse({ params, body: { name: ' А ' } })).toEqual({
      params: { id: 3 },
      body: { name: 'А' },
    });
  });

  test('порожнє тіло -> помилка з поясненням', () => {
    const result = updateRoomSchema.safeParse({ params, body: {} });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Потрібно вказати хоча б одне поле для зміни');
  });

  test.each([
    ['невідоме поле', { color: 'red' }],
    ['порожня назва', { name: '' }],
    ['невідомий тип', { type: 'OFFICE' }],
    ['від’ємна вартість', { monthlyCost: -5 }],
    ['вартість null', { monthlyCost: null }],
  ])('%s -> помилка', (_name, body) => {
    expect(updateRoomSchema.safeParse({ params, body }).success).toBe(false);
  });

  test('некоректний id -> помилка', () => {
    expect(updateRoomSchema.safeParse({ params: { id: 'x' }, body: { name: 'А' } }).success).toBe(
      false
    );
  });
});
