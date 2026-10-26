# Модулі Parents та Staff (API Документація)

Цей документ описує роботу ендпоінтів для керування батьками (`parents`) та співробітниками (`staff`).

---

## 1. Модуль Parents (`/api/v1/parents`)

Доступ мають ролі: **`ADMIN`**, **`MANAGER`**.

### Ендпоінти:
| Метод | Шлях | Опис | Ролі |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/parents` | Створення батьків (+ опціонально акаунт User) | ADMIN, MANAGER |
| `GET` | `/api/v1/parents` | Список усіх батьків (пошук за ім'ям/телефоном) | ADMIN, MANAGER |
| `GET` | `/api/v1/parents/:id` | Картка батьків з прив'язаними дітьми | ADMIN, MANAGER |
| `PATCH` | `/api/v1/parents/:id` | Оновлення ПІБ, телефону або боргу | ADMIN, MANAGER |
| `DELETE` | `/api/v1/parents/:id` | Видалення картки батьків | ADMIN, MANAGER |

### Приклад запиту створення (POST):
```json
{
  "fullName": "Іваненко Петро Олексійович",
  "phone": "+380501234567",
  "debt": 0,
  "user": {
    "email": "petro@example.com",
    "password": "Password123!"
  }
}
```

> **Правило безпеки:** Неможливо видалити батьків, якщо у них є непогашений борг (`debt > 0`). Сервер поверне помилку `409 Conflict`.

---

## 2. Модуль Staff (`/api/v1/staff`)

### Посади працівників (`type`):
* `EDUCATOR` (Вихователь)
* `ASSISTANT` (Помічник вихователя)
* `CLUB_TEACHER` (Викладач гуртка)
* `MANAGER` (Менеджер)

### Ендпоінти:
| Метод | Шлях | Опис | Ролі |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/staff` | Реєстрація працівника (+ акаунт User) | ADMIN, MANAGER |
| `GET` | `/api/v1/staff` | Список працівників (фільтр по type, isActive) | ADMIN, MANAGER, TEACHER |
| `GET` | `/api/v1/staff/:id` | Інформація про працівника, його групи та гуртки | ADMIN, MANAGER, TEACHER |
| `PATCH` | `/api/v1/staff/:id` | Оновлення ПІБ, посади або статусу активності | ADMIN, MANAGER |
| `DELETE` | `/api/v1/staff/:id` | Видалення працівника | ADMIN, MANAGER |

### Приклад запиту створення (POST):
```json
{
  "fullName": "Ковальчук Олена Василівна",
  "type": "EDUCATOR",
  "isActive": true,
  "user": {
    "email": "kovalchuk@kindergarten.local",
    "password": "Password123!"
  }
}
```

> **Правило безпеки:** Неможливо видалити співробітника, який прямо зараз закріплений за активною групою (`educatorOf`, `assistantOf`) або веде гурток (`clubTaught`). Сервер поверне `409 Conflict`.

---

## 3. Запуск тестів

Для запуску всіх unit та integration тестів цих модулів:
```bash
npx jest parents staff --verbose
```
