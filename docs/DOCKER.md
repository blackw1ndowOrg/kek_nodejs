# Докеризація проєкту (Docker & Docker Compose)

Цей документ описує повну інструкцію з розгортання, роботи та архітектури докеризованого бекенду дитячого садка **kek_nodejs**.

---

## 1. Архітектура Docker-середовища

Проєкт складається з двох контейнерів, об'єднаних у спільну Docker-мережу:

1. **`kindergarten-postgres` (`postgres:16-alpine`)**:
   - Образ СУБД PostgreSQL 16 на базі Alpine Linux.
   - Дані зберігаються в іменованому Docker Volume `pgdata`.
   - Внутрішній порт: `5432` (доступний для сервісу `app`).
   - Зовнішній порт для хоста: `5433` (налаштовується через `DB_PORT`).
   - Має вбудований `healthcheck` (`pg_isready -U kg -d kindergarten`).

2. **`kindergarten-app` (`kek_nodejs-app`)**:
   - Створений на базі `node:22-alpine` з підтримкою OpenSSL та `libc6-compat` для коректної роботи бінарного движка Prisma (`linux-musl-openssl-3.0.x`).
   - Запускається лише після того, як база даних успішно проходить `healthcheck` (`depends_on.condition: service_healthy`).
   - Має точку входу `docker-entrypoint.sh`, яка автоматично застосовує міграції (`prisma migrate deploy`) та заповнює початкові дані (`prisma/seed.js`), якщо увімкнено `SEED_ON_STARTUP=true`.
   - Порт сервісу: `3000` (прокинутий на `http://localhost:3000`).
   - Для розробки змонтовано кодову базу `.:/app` та ізольовано `/app/node_modules` через анонімний том, що забезпечує миттєвий **hot-reload** (`node --watch`).

---

## 2. Швидкий запуск (All-in-Docker)

Вам потрібен лише встановлений **Docker Desktop** (або Docker Engine + Compose).

### Крок 1. Підготовка змінних середовища

Створіть `.env` файл (якщо ще не створено):

```bash
cp .env.example .env
```

_(У Windows PowerShell: `copy .env.example .env`)_

### Крок 2. Збірка та запуск

Запустіть обидва сервіси однією командою:

```bash
docker compose up -d --build
```

_Або через npm-скрипт:_

```bash
npm run docker:up
```

### Крок 3. Перевірка працездатності

1. Перегляньте логи запуску:
   ```bash
   docker compose logs -f app
   ```
2. Відкрийте в браузері:
   - **Healthcheck:** [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)
   - **Swagger Документація:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
3. Зупинка контейнерів:
   ```bash
   docker compose down
   ```

---

## 3. Як завантажуються залежності

1. **Ізоляція від ОС хоста**:
   - Під час збірки образу `Dockerfile` копіює `package.json` та `package-lock.json` і виконує команду `npm ci`.
   - Залежності завантажуються безпосередньо у файлову систему контейнера за адресою `/app/node_modules`.
2. **Генерація Prisma Client**:
   - Prisma компілює/завантажує бінарний Query Engine під цільову платформу контейнера (Alpine Linux `musl`).
   - Це усуває проблему несумісності, коли на Windows генеруються файли `.dll.node`, а в Linux потрібні `.so.node`.
3. **Захист від перезапису локальними файлами**:
   - Файл `.dockerignore` забороняє копіювання локальної папки `node_modules` з хоста в образ під час білду.
   - У `docker-compose.yml` вказано анонімний том `- /app/node_modules`. Завдяки цьому при монтуванні поточного коду (`.:/app`) локальна папка `node_modules` з вашого комп'ютера **не затирає** встановлені всередині контейнера Linux-залежності.
4. **Додавання нових пакетів**:
   - Якщо ви встановили новий пакет (`npm install package_name`):
     - Або виконайте повторний білд: `docker compose build` (або `docker compose up -d --build`).
     - Або встановіть безпосередньо в запущений контейнер: `docker compose exec app npm install package_name`.

---

## 4. Робота зі скриптами `package.json`

Усі скрипти з `package.json` повністю збережені та підтримуються у двох режимах:

### Режим А: Виконання всередині Docker (без локального Node.js)

Будь-який скрипт можна запустити всередині контейнера за допомогою `docker compose exec app npm run <script>`:

| Скрипт       | Команда в Docker                                               | Призначення                                  |
| :----------- | :------------------------------------------------------------- | :------------------------------------------- |
| `test`       | `docker compose exec app npm test` (або `npm run docker:test`) | Запуск усіх 1900+ тестів (Jest + Supertest)  |
| `test:cov`   | `docker compose exec app npm run test:cov`                     | Запуск тестів з аналізом покриття коду       |
| `db:seed`    | `docker compose exec app npm run db:seed`                      | Наповнення БД тестовими сутностями           |
| `db:migrate` | `docker compose exec app npm run db:migrate`                   | Створення та застосування нових міграцій     |
| `db:studio`  | `docker compose exec -p 5555:5555 app npx prisma studio`       | Prisma Studio для перегляду БД через браузер |
| `lint`       | `docker compose exec app npm run lint`                         | Перевірка стилю коду через ESLint            |
| `format`     | `docker compose exec app npm run format`                       | Автоформатування файлів через Prettier       |

### Режим Б: Локальна розробка на хості (Host Node.js + Docker Postgres)

Якщо ви віддаєте перевагу запуску сервера або тестів напряму на вашому комп'ютері:

1. Підніміть тільки PostgreSQL у Docker:
   ```bash
   npm run db:up
   ```
2. Запустіть застосунок або тести на хості:
   ```bash
   npm run dev       # Запуск сервера на порту 3000 через localhost:5433
   npm test          # Запуск локальних тестів
   ```
3. Зупинка БД:
   ```bash
   npm run db:down
   ```

---

## 5. Додаткові зручні команди

В оновлений `package.json` додано готові ярлики:

- `npm run docker:up` — підняти весь стек (`app` + `postgres`) з автобілдом у фоновому режимі.
- `npm run docker:down` — зупинити весь стек.
- `npm run docker:build` — перезібрати Docker-образ застосунку.
- `npm run docker:logs` — переглядати логи контейнера застосунку в реальному часі.
- `npm run docker:test` — запустити тести всередині контейнера.
