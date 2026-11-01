const {
  clubIdParams,
  clubIdSchema,
  createClubSchema,
  updateClubSchema,
} = require('../../../src/modules/clubs/clubs.schema');

const valid = { name: 'Музика', roomId: 6, teacherId: 12 };

describe('clubIdParams і clubIdSchema', () => {
  test('id з URL стає числом', () => {
    expect(clubIdParams.parse({ id: '4' })).toEqual({ id: 4 });
    expect(clubIdSchema.parse({ params: { id: '4' } })).toEqual({ params: { id: 4 } });
  });

  test.each(['abc', '0', '-1', '1.5', ''])('id %p -> помилка', (id) => {
    expect(clubIdSchema.safeParse({ params: { id } }).success).toBe(false);
  });

  test('повідомлення про помилку українською', () => {
    expect(clubIdSchema.safeParse({ params: { id: '0' } }).error.issues[0].message).toBe(
      'Некоректний id гуртка'
    );
  });
});

describe('createClubSchema', () => {
  test('валідне тіло; пробіли в назві обрізано', () => {
    const { body } = createClubSchema.parse({ body: { ...valid, name: '  Музика  ' } });
    expect(body).toEqual(valid);
  });

  test('назва рівно 100 символів -> валідно', () => {
    expect(createClubSchema.safeParse({ body: { ...valid, name: 'а'.repeat(100) } }).success).toBe(
      true
    );
  });

  test.each([
    ['без назви', { roomId: 6, teacherId: 12 }],
    ['порожня назва', { ...valid, name: '   ' }],
    ['назва 101 символ', { ...valid, name: 'а'.repeat(101) }],
    ['назва не рядок', { ...valid, name: 5 }],
    ['без кімнати', { name: 'А', teacherId: 12 }],
    ['без викладача', { name: 'А', roomId: 6 }],
    ['кімната рядком', { ...valid, roomId: '6' }],
    ['кімната 0', { ...valid, roomId: 0 }],
    ['кімната дробова', { ...valid, roomId: 1.5 }],
    ['викладач від’ємний', { ...valid, teacherId: -1 }],
    ['викладач null', { ...valid, teacherId: null }],
    ['невідоме поле', { ...valid, color: 'red' }],
  ])('%s -> помилка', (_name, body) => {
    expect(createClubSchema.safeParse({ body }).success).toBe(false);
  });
});

describe('updateClubSchema', () => {
  const params = { id: '4' };

  test.each([
    ['лише назва', { name: 'Шахи' }],
    ['лише кімната', { roomId: 7 }],
    ['лише викладач', { teacherId: 13 }],
    ['усі поля', valid],
  ])('%s -> валідно', (_name, body) => {
    expect(updateClubSchema.safeParse({ params, body }).success).toBe(true);
  });

  test('id з URL стає числом, назва обрізається', () => {
    expect(updateClubSchema.parse({ params, body: { name: ' Шахи ' } })).toEqual({
      params: { id: 4 },
      body: { name: 'Шахи' },
    });
  });

  test('порожнє тіло -> помилка з поясненням', () => {
    const result = updateClubSchema.safeParse({ params, body: {} });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Потрібно вказати хоча б одне поле для зміни');
  });

  test.each([
    ['невідоме поле', { color: 'red' }],
    ['порожня назва', { name: '' }],
    ['кімнату не можна зняти', { roomId: null }],
    ['викладача не можна зняти', { teacherId: null }],
  ])('%s -> помилка', (_name, body) => {
    expect(updateClubSchema.safeParse({ params, body }).success).toBe(false);
  });

  test('некоректний id -> помилка', () => {
    expect(updateClubSchema.safeParse({ params: { id: 'x' }, body: { name: 'А' } }).success).toBe(
      false
    );
  });
});
