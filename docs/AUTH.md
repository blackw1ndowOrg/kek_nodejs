# Автентифікація, Безпека & Валідація (Auth, RBAC & Middleware)

Документація модулів безпеки, контролю доступу (RBAC), обробки помилок та валідації вхідних даних.

---

## 1. Огляд архітектури безпеки

Підсистема реалізує вимоги Етапу 1 (Каркас):
* **Автентифікація:** Stateless JWT-токени з терміном життя 30 хвилин (`JWT_EXPIRES_IN=30m`).
* **Хешування паролів:** `bcryptjs` (salt rounds: 10).
* **Контроль доступу (RBAC):** Middleware `authorize(...roles)` для ролей `ADMIN`, `MANAGER`, `PARENT`, `TEACHER`.
* **Валідація запитів:** Універсальний middleware на базі Zod-схем із поверненням статусу `400 Bad Request` та списку помилок `VALIDATION_ERROR`.
* **Централізовані помилки:** Ієрархія `AppError` із чистими JSON-відповідями формату `{ error: { code, message, details? } }`.

---

## 2. Компоненти та структура

### 2.1. Шар помилок (`src/errors/`)
* **`AppError`** — базовий клас кастомних помилок застосунку:
  * `BadRequestError` (400, `BAD_REQUEST`)
  * `UnauthorizedError` (401, `UNAUTHORIZED`)
  * `ForbiddenError` (403, `FORBIDDEN`)
  * `NotFoundError` (404, `NOT_FOUND`)
  * `ConflictError` (409, `CONFLICT`)
* **`errorHandler` (`src/middleware/errorHandler.js`):**
  * Перехоплює `ZodError` і автоматично перетворює на `400 Bad Request` із кодом `VALIDATION_ERROR`.
  * Перехоплює помилки `AppError` та виставляє відповідні HTTP-статуси.
  * При невідомих помилках повертає `500 Internal Server Error` без витоку внутрішніх деталей чи паролів.

### 2.2. Валідація (`src/middleware/validate.js`)
Універсальний middleware для перевірки вхідних даних:
```javascript
const { validate } = require('../../middleware/validate');
const { someSchema } = require('./some.schema');

// Перевіряє req.body, req.query або req.params згідно зі схемою Zod
router.post('/items', validate(someSchema), controller.create);
```
Підтримує як пряму валідацію `req.body`, так і комплексну `{ body, query, params }` з автоматичним приведенням типів (coercion). Результат валідації записується у `req.valid` (`{ body?, query?, params? }`), а також оновлюються `req.body`, `req.params` та `req.query` (через `Object.defineProperty` для сумісності з read-only геттером `req.query` в Express 5).

### 2.3. Захист маршрутів (`src/middleware/auth.js` та `authorize.js`)
* **`auth`:** Витягує та перевіряє Bearer токен із заголовка `Authorization`. Підшиває об'єкт користувача у `req.user = { id, email, role }`.
* **`authorize(...roles)`:** Перевіряє, чи роль користувача збігається з дозволеними.
```javascript
const { auth } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');

// Доступ лише для Admin та Manager:
router.post('/groups', auth, authorize('ADMIN', 'MANAGER'), groupsController.create);
```

---

## 3. Ендпоінти API

Усі маршрути авторизації підключені за префіксом `/api/v1/auth`.

### 3.1. Вхід у систему (Login)
* **URL:** `POST /api/v1/auth/login`
* **Тіло запиту:**
  ```json
  {
    "email": "admin@kindergarten.local",
    "password": "Admin123!"
  }
  ```
* **Успішна відповідь (`200 OK`):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "admin@kindergarten.local",
      "role": "ADMIN"
    }
  }
  ```
* **Помилка валідації (`400 Bad Request`):**
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Validation failed",
      "details": [
        { "path": "email", "message": "Некоректний формат email" }
      ]
    }
  }
  ```
* **Невірні облікові дані (`401 Unauthorized`):**
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Invalid email or password"
    }
  }
  ```

---

### 3.2. Поточний профіль користувача (/me)
* **URL:** `GET /api/v1/auth/me`
* **Заголовки:** `Authorization: Bearer <TOKEN>`
* **Успішна відповідь (`200 OK`):**
  ```json
  {
    "user": {
      "id": 1,
      "email": "admin@kindergarten.local",
      "role": "ADMIN"
    }
  }
  ```
* **Відсутній або прострочений токен (`401 Unauthorized`):**
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Token not provided" // або "Invalid or expired token"
    }
  }
  ```

---

## 4. Швидка перевірка через cURL

```bash
# 1. Отримати токен:
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kindergarten.local","password":"Admin123!"}' | jq -r '.token')

# 2. Отримати свій профіль за токеном:
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/me
```

---

## 5. Тестування

Модуль повністю покритий unit-тестами. Покриття коду складає **100%**:
```bash
npx jest tests/unit/ --coverage
```
Покриті всі гілки валідації, помилок, відсутності заголовків, прострочення токенів та перевірки прав ролей.
