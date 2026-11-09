# Історія змін (AuditLog)

Вимога: зберігати всі стани даних — історію будь-якої зміни будь-чого в базі.

Кожен `INSERT`, `UPDATE` і `DELETE` у будь-якій таблиці записує тригер PostgreSQL у таблицю `AuditLog`: рядок до зміни, рядок після зміни, хто і коли. Механізм у базі, а не в коді модулів, тому історія пишеться для будь-яких записів: `update`, `updateMany`, `deleteMany`, каскадних видалень (`onDelete: Cascade` / `SetNull`), seed і ручних SQL-запитів.

---

## 1. Таблиця `AuditLog`

| Поле | Зміст |
| --- | --- |
| `tableName` | Таблиця, напр. `Absence`, `Child` |
| `recordId` | Первинний ключ рядка як текст; складений — через `:` (`ParentChild`: `"3:12"`, `Setting`: ключ налаштування) |
| `action` | `INSERT`, `UPDATE`, `DELETE` |
| `changedColumns` | `UPDATE` — лише змінені колонки; `INSERT`/`DELETE` — усі колонки |
| `oldData` | Рядок до зміни (JSON), для `UPDATE` і `DELETE` |
| `newData` | Рядок після зміни (JSON), для `INSERT` і `UPDATE` |
| `actorUserId` | `User.id` того, хто зробив зміну; `null`, якщо запис ішов не через `withActor` |
| `txId` | Id транзакції: зміни одного запиту мають однаковий `txId` |
| `changedAt` | Час зміни (UTC) |

- `UPDATE`, що нічого не змінив, не записується.
- `User.passwordHash` в історію не потрапляє: значення вирізається, але в `changedColumns` видно, що пароль змінили.
- Історія лише доповнюється: `UPDATE` і `DELETE` у `AuditLog` блокує тригер `audit_log_append_only`.
- Стан запису на будь-який момент: усі рядки `AuditLog` з потрібними `tableName` і `recordId` за `id`.

---

## 2. Хто зробив зміну: `withActor`

Тригер не знає користувача застосунку, тож автор передається через налаштування транзакції `app.actor_id`. Його ставить `withActor` із `src/config/audit.js`:

```js
const { withActor } = require('../../config/audit');

async create(data, actorUserId) {
  return withActor(this.db, actorUserId, (tx) => tx.absence.create({ data }));
}
```

- Усі записи всередині — через `tx`, а не через `this.db`: інакше вони підуть поза транзакцією без автора.
- `set_config(..., true)` діє лише до кінця транзакції, тож автор не «протікає» в інший запит із пулу з'єднань.
- Сервіс передає в репозиторій `user.id` з JWT.

Зараз через `withActor` пишуть відсутності (`absences`). В інших модулях зміни теж записуються в історію, але з `actorUserId = null`, доки їхні репозиторії не перейдуть на `withActor`.

---

## 3. Правило для нових таблиць

Кожна нова таблиця в міграції має вмикати історію:

```sql
SELECT enable_audit('"NewTable"');                                      -- ключ id
SELECT enable_audit('"Link"', ARRAY['aId', 'bId']);                       -- складений ключ
SELECT enable_audit('"Account"', ARRAY['id'], ARRAY['secret']);          -- приховати колонку
```

Тест `tests/integration/audit.db.test.js` перевіряє, що тригер є на кожній таблиці, крім `AuditLog` і `_prisma_migrations`. Якщо забути `enable_audit`, тест на справжній базі впаде з назвою таблиці.

---

## 4. Міграції

| Міграція | Що робить |
| --- | --- |
| `20261109140000_add_audit_log` | Таблиця `AuditLog`, функції `audit_row_change`, `enable_audit`, захист від змін історії; історія для всіх наявних таблиць |
| `20261109150000_add_absence` | Таблиця `Absence` і `enable_audit('"Absence"')` |

Тригери й функції живуть лише в SQL міграцій: Prisma їх не описує у схемі й не видаляє.

---

## 5. Тестування

| Файл | Що перевіряє |
| --- | --- |
| `tests/unit/audit.test.js` | `withActor`: `set_config` перед записами, в одній транзакції |
| `tests/integration/audit.db.test.js` | справжня PostgreSQL: тригер на кожній таблиці, автор і стан до видалення, лише змінені колонки, прихований пароль, складений ключ, незмінність історії |
