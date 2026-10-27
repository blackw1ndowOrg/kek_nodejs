const {
  groupIdSchema,
  listGroupsSchema,
  createGroupSchema,
  updateGroupSchema,
  enrollChildSchema,
  groupChildSchema,
} = require('../../../src/modules/groups/groups.schema');

const validGroup = { name: 'Сонечко', age: 3, roomId: 6 };

describe('groupIdSchema', () => {
  test('id з URL стає числом', () => {
    expect(groupIdSchema.parse({ params: { id: '4' } })).toEqual({ params: { id: 4 } });
  });

  test.each(['abc', '0', '-1'])('id %p -> помилка', (id) => {
    expect(groupIdSchema.safeParse({ params: { id } }).success).toBe(false);
  });
});

describe('listGroupsSchema', () => {
  test('без фільтрів і з віком', () => {
    expect(listGroupsSchema.parse({ query: {} })).toEqual({ query: {} });
    expect(listGroupsSchema.parse({ query: { age: '4' } })).toEqual({ query: { age: 4 } });
  });

  test.each(['1', '6', 'abc'])('age %p -> помилка', (age) => {
    expect(listGroupsSchema.safeParse({ query: { age } }).success).toBe(false);
  });
});

describe('createGroupSchema', () => {
  test('мінімальне тіло; пробіли в назві обрізано', () => {
    const { body } = createGroupSchema.parse({ body: { ...validGroup, name: ' Сонечко ' } });
    expect(body).toEqual(validGroup);
  });

  test('з персоналом або null', () => {
    const body = { ...validGroup, educatorId: 1, assistantId: 2 };
    expect(createGroupSchema.safeParse({ body }).success).toBe(true);
    expect(
      createGroupSchema.safeParse({ body: { ...validGroup, educatorId: null, assistantId: null } })
        .success
    ).toBe(true);
  });

  test.each([
    ['без назви', { age: 3, roomId: 6 }],
    ['порожня назва', { ...validGroup, name: '  ' }],
    ['вік 1', { ...validGroup, age: 1 }],
    ['вік 6', { ...validGroup, age: 6 }],
    ['без кімнати', { name: 'А', age: 3 }],
    ['кімната рядком', { ...validGroup, roomId: '6' }],
    ['невідоме поле', { ...validGroup, children: [1] }],
  ])('%s -> помилка', (_name, body) => {
    expect(createGroupSchema.safeParse({ body }).success).toBe(false);
  });
});

describe('updateGroupSchema', () => {
  test.each([
    ['зняти вихователя', { educatorId: null }],
    ['змінити назву й кімнату', { name: 'Зайчики', roomId: 7 }],
    ['змінити вік', { age: 4 }],
  ])('%s -> валідно', (_name, body) => {
    expect(updateGroupSchema.safeParse({ params: { id: '1' }, body }).success).toBe(true);
  });

  test.each([
    ['порожнє тіло', {}],
    ['невідоме поле', { childId: 3 }],
    ['кімнату не можна зняти', { roomId: null }],
  ])('%s -> помилка', (_name, body) => {
    expect(updateGroupSchema.safeParse({ params: { id: '1' }, body }).success).toBe(false);
  });
});

describe('enrollChildSchema і groupChildSchema', () => {
  test('зарахування: childId у тілі', () => {
    expect(enrollChildSchema.parse({ params: { id: '2' }, body: { childId: 5 } })).toEqual({
      params: { id: 2 },
      body: { childId: 5 },
    });
  });

  test.each([{}, { childId: '5' }, { childId: 5, groupId: 1 }])('тіло %p -> помилка', (body) => {
    expect(enrollChildSchema.safeParse({ params: { id: '2' }, body }).success).toBe(false);
  });

  test('відрахування: обидва id з URL', () => {
    expect(groupChildSchema.parse({ params: { id: '2', childId: '5' } })).toEqual({
      params: { id: 2, childId: 5 },
    });
    expect(groupChildSchema.safeParse({ params: { id: '2', childId: 'x' } }).success).toBe(false);
  });
});
