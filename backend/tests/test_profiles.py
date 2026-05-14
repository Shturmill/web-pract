"""Интеграционные тесты роутера профилей (backend/routers/profiles.py)."""

from __future__ import annotations

import pytest

VALID_PHONE = "+7 900 000-00-00"
VALID_PHONE_NORMALIZED = "79000000000"


# --- POST /api/client/profile ---

def test_client_profile_valid(client):
    response = client.post(
        "/api/client/profile", json={"name": "Иван Петров", "phone": VALID_PHONE}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["id"], int)
    assert data["role"] == "client"
    assert data["name"] == "Иван Петров"
    assert data["phone"] == VALID_PHONE
    assert data["phoneNormalized"] == VALID_PHONE_NORMALIZED


def test_client_profile_upsert_same_phone(client):
    first = client.post(
        "/api/client/profile", json={"name": "Иван Петров", "phone": VALID_PHONE}
    ).json()
    second = client.post(
        "/api/client/profile", json={"name": "Пётр Иванов", "phone": VALID_PHONE}
    ).json()
    assert second["id"] == first["id"]
    assert second["name"] == "Пётр Иванов"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Ivan2", "phone": VALID_PHONE},
        {"name": "Иван Петров", "phone": "8 900 000-00-00"},
        {"name": "Иван Петров", "phone": "+7 900"},
        {"phone": VALID_PHONE},
        {"name": "Иван Петров"},
    ],
)
def test_client_profile_invalid_422(client, payload):
    response = client.post("/api/client/profile", json=payload)
    assert response.status_code == 422


# --- POST /api/master/login ---

def test_master_login_missing_env_500(client, no_master_code):
    response = client.post(
        "/api/master/login", json={"name": "Test Master", "code": "any-valid-code"}
    )
    assert response.status_code == 500
    assert "MASTER_ACCESS_CODE" in response.json()["detail"]


def test_master_login_wrong_code_401(client, master_code):
    response = client.post(
        "/api/master/login", json={"name": "Test Master", "code": "wrongcode1"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Неверный код мастера."


def test_master_login_correct_code_200(client, master_code):
    response = client.post(
        "/api/master/login", json={"name": "Test Master", "code": master_code}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "master:test-master"
    assert data["role"] == "master"
    assert data["name"] == "Test Master"


def test_master_login_code_failing_schema_422(client, master_code):
    response = client.post(
        "/api/master/login", json={"name": "Test Master", "code": "ab"}
    )
    assert response.status_code == 422


def test_master_login_invalid_name_422(client, master_code):
    response = client.post(
        "/api/master/login", json={"name": "1bad", "code": master_code}
    )
    assert response.status_code == 422


def test_master_login_twice_same_id(client, master_code):
    first = client.post(
        "/api/master/login", json={"name": "Test Master", "code": master_code}
    ).json()
    second = client.post(
        "/api/master/login", json={"name": "Test Master", "code": master_code}
    ).json()
    assert first["id"] == second["id"] == "master:test-master"
