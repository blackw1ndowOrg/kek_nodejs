# База даних: PostgreSQL + Docker + Prisma

Потрібно: Node.js 22+ та Docker (Docker Desktop на Windows/macOS).

## Швидкий старт

```bash
git clone https://github.com/blackw1ndow/kek_nodejs.git
cd kek_nodejs
npm install
cp .env.example .env     # Windows PowerShell: copy .env.example .env
npm run db:setup         # Postgres у Docker + міграції + seed
npm run dev
```

Результат: база `kindergarten` працює на `localhost:5433` (або порт з `DB_PORT`), таблиці створені, дані заповнені.

## Файл `.env`

`.env.example` лише шаблон, програма читає саме `.env`. Змінні:

| Змінна               | Призначення                                                    |
| -------------------- | -------------------------------------------------------------- |
| `PORT`               | порт застосунку (3000)                                         |
| `DATABASE_URL`       | рядок підключення Prisma до Postgres                           |
| `DB_PORT`            | порт на вашому комп'ютері для Postgres (за замовчуванням 5433) |
| `JWT_SECRET`         | секрет для токенів                                             |
| `ADMIN_EMAIL`        | email Admin, якого створює seed                                |
| `ADMIN_PASSWORD`     | пароль Admin, якого створює seed                               |
| `SEED_USER_PASSWORD` | пароль за замовчуванням для інших акаунтів seed                |

Якщо змінюєте `DB_PORT`, змініть те саме число в `DATABASE_URL`.

## Що створюється

- **Docker:** контейнер `kindergarten-postgres` (образ `postgres:16-alpine`), дані в volume `pgdata`, користувач `kg`, пароль `kg`, база `kindergarten`.
- **Prisma:** 10 таблиць (User, Parent, Child, ParentChild, Room, Group, Staff, Club, ScheduleSlot, Setting). Схема в `prisma/schema.prisma`, клієнт у `src/config/prisma.js`.
- **Seed (`prisma/seed.js`):** налаштування цін, зарплат і порогів у `Setting`, кімнати (гурткові та групові), тестові користувачі (`Admin`, `Manager`, `Teacher`, `Parent` з паролем `Password123!`), персонал усіх типів, гуртки, 4 вікові групи, батьки, діти з усіма типами пільг (0%, 10%, 20%, 30%), планами оплати та нотатками, родинні зв'язки (зокрема сім'ї з двома дітьми), а також еталонний тижневий розклад занять і режимних моментів. Seed повністю ідемпотентний, кожна функція відповідає за одну сутність.

Усі суми зберігаються в копійках, час розкладу у хвилинах від півночі (08:00 = 480).

### Тестові облікові записи (seed)

| Роль      | Email                                                                                                                                                                                      | Пароль                                    | Опис                                                           |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :------------------------------------------------------------- |
| `ADMIN`   | `admin@kindergarten.local`                                                                                                                                                                 | `Admin123!` (або `ADMIN_PASSWORD`)        | Повний доступ до всіх сутностей та фінансових звітів           |
| `MANAGER` | `manager@kindergarten.local`                                                                                                                                                               | `Password123!` (або `SEED_USER_PASSWORD`) | Менеджер садка (операційна робота)                             |
| `TEACHER` | `teacher.music@kindergarten.local`<br>`teacher.english@kindergarten.local`<br>`teacher.chess@kindergarten.local`<br>`teacher.art@kindergarten.local`<br>`teacher.dance@kindergarten.local` | `Password123!`                            | Викладачі гуртків (Музика, Англійська, Шахи, Малювання, Танці) |
| `TEACHER` | `educator.sonechko@kindergarten.local`<br>`educator.dzvinochok@kindergarten.local`<br>`educator.chomusyky@kindergarten.local`<br>`educator.piznayky@kindergarten.local`                    | `Password123!`                            | Вихователі вікових груп                                        |
| `TEACHER` | `assistant.sonechko@kindergarten.local`<br>`assistant.dzvinochok@kindergarten.local`<br>`assistant.chomusyky@kindergarten.local`<br>`assistant.piznayky@kindergarten.local`                | `Password123!`                            | Помічники вихователів                                          |
| `PARENT`  | `parent.petrenko@example.com`<br>`parent.sydorenko@example.com`<br>`parent.koval@example.com`<br>`parent.melnyk@example.com`                                                               | `Password123!`                            | Батьки дітей (Сидоренко має двох дітей у садку)                |

## Команди

| Команда              | Що робить                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run db:up`      | запускає Postgres у Docker і чекає, поки він готовий                                            |
| `npm run db:down`    | зупиняє контейнер (дані зберігаються)                                                           |
| `npm run db:reset`   | повністю стирає БД і створює заново (міграції + seed)                                           |
| `npm run db:migrate` | створює або застосовує міграції (`prisma migrate dev`)                                          |
| `npm run db:seed`    | заповнює БД базовими сутностями (налаштування, кімнати, персонал, групи, діти, батьки, розклад) |
| `npm run db:studio`  | Prisma Studio: перегляд таблиць у браузері                                                      |
| `npm run db:setup`   | `db:up`, потім міграції, потім seed                                                             |

`npm run db:up` скорочення для `docker compose up -d --wait`: скрипти записані в `package.json`.

## Як перевірити

1. `docker compose ps`: статус `running (healthy)`.
2. `npx prisma validate`: схема валідна.
3. `npm run db:studio`: таблиці зі `schema.prisma` створені, а таблиці, які заповнює seed, містять дані.
4. `npm run test:cov`: тести проходять, покриття не нижче 95%.

## Зміна схеми

1. Правите `prisma/schema.prisma`.
2. Виконуєте `npx prisma migrate dev --name <коротко_що_змінили>`.
3. Комітите разом із папкою `prisma/migrations/`, інакше в інших учасників БД не оновиться.

Після `git pull` з чужими міграціями виконайте `npm run db:migrate`.
