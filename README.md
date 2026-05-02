# web-pract — ServiceBox

Многостраничный сайт мастерской ремонта техники с полноценным локальным backend на Python + FastAPI и базой SQLite.

Frontend остаётся учебным: HTML5, CSS3 и Vanilla JavaScript. Backend отвечает за профили, заявки, жизненный цикл заявок и переписку клиента с мастером.


## Что реализовано

- FastAPI backend.
- SQLite база данных.
- Таблицы `clients`, `masters`, `requests`, `messages`.
- Профиль клиента сохраняется в браузере и дублируется в SQLite по телефону.
- Профиль мастера сохраняется в браузере после входа-заглушки.
- Заявки создаются на сервере и хранятся в SQLite.
- У заявки есть жизненный цикл: `open`, `in_progress`, `done`.
- `assignee` хранит мастера, который взял заявку.
- Общая доска мастера показывает только `status = open`.
- Личная доска мастера показывает только `status = in_progress` и `assignee = текущий мастер`.
- Клиент видит только свои заявки по телефону профиля.
- Клиент и мастер могут переписываться по заявке через серверную таблицу `messages`.
- Дата заявки не может быть раньше текущего момента: проверка есть и на frontend, и на backend.
- Защита от одновременного взятия заявки: backend делает атомарное обновление `WHERE id = ? AND status = 'open'`.
- Защита от SQL-инъекций: все пользовательские значения передаются в SQL через параметры `?`, а не через конкатенацию строк.

## Запуск через Docker Compose

```bash
docker compose up --build
```

Открыть сайт:

```text
http://localhost:8080
```

API будет доступен по тому же адресу:

```text
http://localhost:8080/api/health
```

SQLite-файл хранится в Docker volume `servicebox-data`, поэтому заявки не пропадают при перезапуске контейнера.

Остановить проект:

```bash
docker compose down
```

Удалить базу вместе с volume:

```bash
docker compose down -v
```

## Запуск без Docker

```bash
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
# .venv\Scripts\activate        # Windows PowerShell
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8080
```

Открыть:

```text
http://127.0.0.1:8080
```

## Код мастера

По умолчанию используется учебный код:

```text
1234
```

Его можно поменять через переменную окружения `MASTER_ACCESS_CODE` в `docker-compose.yml`.

## Основные API endpoints

```text
GET  /api/health
GET  /api/repair-options
POST /api/client/profile
POST /api/master/login
POST /api/requests
GET  /api/requests/client?phone=...
GET  /api/requests/open
GET  /api/requests/master?masterId=...
POST /api/requests/{id}/accept
POST /api/requests/{id}/messages
POST /api/requests/{id}/done
```
