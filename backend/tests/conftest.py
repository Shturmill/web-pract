"""Общие фикстуры и изоляция БД для тестов backend.

Важно: ``backend/database.py`` вычисляет ``DATABASE_PATH`` из переменной
окружения на момент импорта. Поэтому здесь, ДО любого ``import backend``,
выставляется временный путь — как страховка, чтобы реальный
``data/servicebox.sqlite`` не был затронут ни при каких обстоятельствах.
Per-test изоляция делается фикстурой ``fresh_db`` через monkeypatch.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

# --- import-time guard: должно стоять до импорта backend.* ---
_IMPORT_GUARD_DIR = tempfile.mkdtemp(prefix="servicebox-test-")
os.environ["DATABASE_PATH"] = str(Path(_IMPORT_GUARD_DIR) / "import-guard.sqlite")
# MASTER_ACCESS_CODE намеренно НЕ выставляется глобально — тест на его
# отсутствие должен видеть переменную незаданной.
os.environ.pop("MASTER_ACCESS_CODE", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import database  # noqa: E402
from backend.database import get_db, init_db  # noqa: E402
from backend.main import app  # noqa: E402

VALID_PHONE = "+7 900 000-00-00"
VALID_PHONE_NORMALIZED = "79000000000"
MASTER_NAME = "Test Master"
MASTER_ID = "master:test-master"  # = "master:" + slugify(MASTER_NAME)
MASTER_CODE = "test-code-123"


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Каждому тесту — своя пустая SQLite-БД во временном каталоге."""
    db_file = tmp_path / "test.sqlite"
    monkeypatch.setattr(database, "DATABASE_PATH", db_file)
    init_db()
    yield db_file


@pytest.fixture
def client(fresh_db):
    """FastAPI TestClient. Контекст-форма запускает startup-событие."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_conn(fresh_db):
    """Открытое соединение с тестовой БД для юнит-тестов репозитория."""
    with get_db() as conn:
        yield conn


@pytest.fixture
def master_code(monkeypatch):
    """Выставляет MASTER_ACCESS_CODE; роут читает os.getenv в момент запроса."""
    monkeypatch.setenv("MASTER_ACCESS_CODE", MASTER_CODE)
    return MASTER_CODE


@pytest.fixture
def no_master_code(monkeypatch):
    """Гарантирует, что MASTER_ACCESS_CODE не задан."""
    monkeypatch.delenv("MASTER_ACCESS_CODE", raising=False)


@pytest.fixture
def valid_request_payload():
    """Корректный payload для POST /api/requests (без preferredTime)."""
    return {
        "clientName": "Иван Петров",
        "phone": VALID_PHONE,
        "device": "iPhone 12",
        "repairId": "battery",
        "preferredTime": None,
        "comment": "Быстро садится батарея",
    }


@pytest.fixture
def make_request(client, valid_request_payload):
    """Фабрика: создаёт заявку, проверяет 201, возвращает её JSON."""

    def _make(**overrides):
        payload = {**valid_request_payload, **overrides}
        response = client.post("/api/requests", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make


@pytest.fixture
def accepted_request(client, make_request):
    """Создаёт заявку и переводит её в in_progress.

    Возвращает кортеж ``(request_json, master_id, master_name)``.
    Эндпоинт accept не проверяет код мастера — логин здесь не нужен.
    """

    def _accept(**overrides):
        created = make_request(**overrides)
        response = client.post(
            f"/api/requests/{created['id']}/accept",
            json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
        )
        assert response.status_code == 200, response.text
        return response.json(), MASTER_ID, MASTER_NAME

    return _accept
