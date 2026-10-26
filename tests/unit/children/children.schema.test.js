const {
  childIdSchema,
  listChildrenSchema,
  createChildSchema,
  updateChildSchema,
} = require('../../../src/modules/children/children.schema');

const validChild = { fullName: 'Іван Петренко', birthDate: '2022-03-15', parentIds: [1] };

describe('childIdSchema', () => {
  test('рядок з URL перетворюється на число', () => {
    expect(childIdSchema.parse({ params: { id: '5' } })).toEqual({ params: { id: 5 } });
  });

  test.each(['abc', '0', '-1', '2.5'])('id %p -> помилка', (id) => {
    expect(childIdSchema.safeParse({ params: { id } }).success).toBe(false);
  });
});

describe('listChildrenSchema', () => {
  test('без фільтрів — валідно', () => {
    expect(listChildrenSchema.parse({ query: {} })).toEqual({ query: {} });
  });

  test('groupId стає числом, isActive — boolean', () => {
    expect(listChildrenSchema.parse({ query: { groupId: '3', isActive: 'false' } })).toEqual({
      query: { groupId: 3, isActive: false },
    });
    expect(listChildrenSchema.parse({ query: { isActive: 'true' } }).query.isActive).toBe(true);
  });

  test.each([
    ['isActive', 'yes'],
    ['isActive', '1'],
    ['groupId', 'abc'],
    ['groupId', '0'],
  ])('%s=%p -> помилка', (key, value) => {
    expect(listChildrenSchema.safeParse({ query: { [key]: value } }).success).toBe(false);
  });
});

describe('createChildSchema', () => {
  test('мінімальне валідне тіло: пробіли обрізано, birthDate став Date', () => {
    const { body } = createChildSchema.parse({ body: { ...validChild, fullName: ' Іван ' } });
    expect(body.fullName).toBe('Іван');
    expect(body.birthDate).toBeInstanceOf(Date);
    expect(body.birthDate.toISOString()).toBe('2022-03-15T00:00:00.000Z');
  });

  test('notes: null при створенні дозволено', () => {
    expect(createChildSchema.safeParse({ body: { ...validChild, notes: null } }).success).toBe(
      true
    );
  });

  test('усі необов’язкові поля', () => {
    const body = {
      ...validChild,
      notes: 'не любить гречку',
      paymentPlan: 'YEARLY',
      discountPercent: 20,
      hasDeputyRelatives: true,
    };
    expect(createChildSchema.safeParse({ body }).success).toBe(true);
  });

  test.each([
    ['без fullName', { birthDate: '2022-03-15', parentIds: [1] }],
    ['порожнє fullName', { ...validChild, fullName: '   ' }],
    ['без birthDate', { fullName: 'Іван', parentIds: [1] }],
    ['неіснуюча дата', { ...validChild, birthDate: '2022-02-30' }],
    ['дата не в форматі ISO', { ...validChild, birthDate: '15.03.2022' }],
    ['без parentIds', { fullName: 'Іван', birthDate: '2022-03-15' }],
    ['порожній parentIds', { ...validChild, parentIds: [] }],
    ['parentIds з рядком', { ...validChild, parentIds: ['1'] }],
    ['знижка понад 100', { ...validChild, discountPercent: 150 }],
    ['дробова знижка', { ...validChild, discountPercent: 10.5 }],
    ['невідомий paymentPlan', { ...validChild, paymentPlan: 'WEEKLY' }],
    ['groupId заборонено (.strict)', { ...validChild, groupId: 1 }],
  ])('%s -> помилка', (_name, body) => {
    expect(createChildSchema.safeParse({ body }).success).toBe(false);
  });
});

describe('updateChildSchema', () => {
  test.each([
    ['notes: null — стерти примітку', { notes: null }],
    ['isActive', { isActive: true }],
    ['кілька полів', { fullName: 'Олена', birthDate: '2023-01-10', discountPercent: 10 }],
  ])('%s -> валідно', (_name, body) => {
    expect(updateChildSchema.safeParse({ params: { id: '1' }, body }).success).toBe(true);
  });

  test('id з URL стає числом', () => {
    expect(
      updateChildSchema.parse({ params: { id: '7' }, body: { isActive: false } }).params.id
    ).toBe(7);
  });

  test.each([
    ['порожнє тіло', { id: '1' }, {}],
    ['groupId заборонено (.strict)', { id: '1' }, { groupId: 2 }],
    ['parentIds тут не міняються', { id: '1' }, { parentIds: [2] }],
    ['невалідний id', { id: 'x' }, { isActive: true }],
  ])('%s -> помилка', (_name, params, body) => {
    expect(updateChildSchema.safeParse({ params, body }).success).toBe(false);
  });
});
