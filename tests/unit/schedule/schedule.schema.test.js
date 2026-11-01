const {
  groupParams,
  slotParams,
  groupScheduleSchema,
  updateSlotSchema,
} = require('../../../src/modules/schedule/schedule.schema');

describe('groupParams і groupScheduleSchema', () => {
  test('groupId з URL стає числом', () => {
    expect(groupParams.parse({ groupId: '3' })).toEqual({ groupId: 3 });
    expect(groupScheduleSchema.parse({ params: { groupId: '3' } })).toEqual({
      params: { groupId: 3 },
    });
  });

  test.each(['abc', '0', '-1', '1.5', ''])('groupId %p -> помилка', (groupId) => {
    expect(groupScheduleSchema.safeParse({ params: { groupId } }).success).toBe(false);
  });

  test('повідомлення про помилку українською', () => {
    const result = groupScheduleSchema.safeParse({ params: { groupId: '0' } });
    expect(result.error.issues[0].message).toBe('Некоректний id групи');
  });
});

describe('slotParams', () => {
  test('id слота з URL стає числом', () => {
    expect(slotParams.parse({ id: '7' })).toEqual({ id: 7 });
  });

  test.each(['abc', '0', '-2'])('id %p -> помилка', (id) => {
    expect(slotParams.safeParse({ id }).success).toBe(false);
  });
});

describe('updateSlotSchema', () => {
  const params = { id: '7' };
  const parse = (body) => updateSlotSchema.safeParse({ params, body });

  test('id з URL стає числом', () => {
    expect(updateSlotSchema.parse({ params, body: { clubId: 3 } })).toEqual({
      params: { id: 7 },
      body: { clubId: 3 },
    });
  });

  test.each([
    ['день', { dayOfWeek: 3 }],
    ['початок', { startMinute: 600 }],
    ['кінець', { endMinute: 645 }],
    ['гурток', { clubId: 2 }],
    ['день і час', { dayOfWeek: 2, startMinute: 600, endMinute: 645 }],
    ['усе разом', { dayOfWeek: 5, startMinute: 540, endMinute: 585, clubId: 1 }],
  ])('%s -> валідно', (_name, body) => {
    expect(parse(body).success).toBe(true);
  });

  test.each([
    ['dayOfWeek 1', { dayOfWeek: 1 }],
    ['dayOfWeek 5', { dayOfWeek: 5 }],
    ['startMinute 0', { startMinute: 0 }],
    ['startMinute 1439', { startMinute: 1439 }],
    ['endMinute 1', { endMinute: 1 }],
    ['endMinute 1440', { endMinute: 1440 }],
  ])('межа %s -> валідно', (_name, body) => {
    expect(parse(body).success).toBe(true);
  });

  test.each([
    ['dayOfWeek 0', { dayOfWeek: 0 }],
    ['dayOfWeek 6', { dayOfWeek: 6 }],
    ['dayOfWeek дробовий', { dayOfWeek: 1.5 }],
    ['startMinute -1', { startMinute: -1 }],
    ['startMinute 1440', { startMinute: 1440 }],
    ['endMinute 0', { endMinute: 0 }],
    ['endMinute 1441', { endMinute: 1441 }],
    ['clubId 0', { clubId: 0 }],
    ['clubId рядком', { clubId: '2' }],
    ['clubId null', { clubId: null }],
    ['активність змінювати не можна', { activity: 'CLUB' }],
    ['зайве поле', { groupId: 2 }],
  ])('%s -> помилка', (_name, body) => {
    expect(parse(body).success).toBe(false);
  });

  test('порожнє тіло -> помилка з поясненням', () => {
    const result = parse({});
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Потрібно вказати хоча б одне поле для зміни');
  });

  test.each([
    ['початок дорівнює кінцю', { startMinute: 600, endMinute: 600 }],
    ['початок пізніше за кінець', { startMinute: 700, endMinute: 600 }],
  ])('%s -> помилка', (_name, body) => {
    const result = parse(body);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Початок заняття має бути раніше за кінець');
  });

  test('некоректний id слота -> помилка', () => {
    expect(updateSlotSchema.safeParse({ params: { id: 'x' }, body: { clubId: 1 } }).success).toBe(
      false
    );
  });
});
