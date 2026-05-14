"""Юнит-тесты хелперов backend/repository.py."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException

from backend.database import get_db
from backend.repository import (
    format_price,
    get_request_or_404,
    row_to_request,
    rows_to_messages,
    slugify,
    upsert_client,
    upsert_master,
    utc_now_iso,
)

VALID_PHONE = "+7 900 000-00-00"
VALID_PHONE_NORMALIZED = "79000000000"


# --- utc_now_iso ---

def test_utc_now_iso_is_parseable_tz_aware_second_precision():
    value = utc_now_iso()
    parsed = datetime.fromisoformat(value)
    assert parsed.tzinfo is not None
    assert parsed.microsecond == 0
    assert "." not in value


# --- slugify ---

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Иван Петров", "иван-петров"),
        ("John  Smith!!", "john-smith"),
        ("  --leading--  ", "leading"),
        ("Test Master", "test-master"),
    ],
)
def test_slugify(raw, expected):
    assert slugify(raw) == expected


@pytest.mark.parametrize("raw", ["!!!", "", "   "])
def test_slugify_fallback_is_non_empty_without_dashes(raw):
    result = slugify(raw)
    assert result
    assert not result.startswith("-")
    assert not result.endswith("-")


# --- format_price ---

@pytest.mark.parametrize(
    "value, expected",
    [
        (None, "—"),
        (0, "от 0 ₽"),
        (2490, "от 2 490 ₽"),
        (1490000, "от 1 490 000 ₽"),
    ],
)
def test_format_price(value, expected):
    assert format_price(value) == expected


# --- upsert_client ---

def test_upsert_client_inserts_new(db_conn):
    row = upsert_client(db_conn, "Иван Петров", VALID_PHONE)
    assert row["phone_normalized"] == VALID_PHONE_NORMALIZED
    assert row["name"] == "Иван Петров"
    assert row["id"] is not None


def test_upsert_client_updates_existing_same_id(db_conn):
    first = upsert_client(db_conn, "Иван Петров", VALID_PHONE)
    second = upsert_client(db_conn, "Пётр Иванов", VALID_PHONE)
    assert second["id"] == first["id"]
    assert second["name"] == "Пётр Иванов"
    count = db_conn.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"]
    assert count == 1


def test_upsert_client_collapses_phone_formats(db_conn):
    first = upsert_client(db_conn, "Иван Петров", "+7 900 000-00-00")
    second = upsert_client(db_conn, "Иван Петров", "+7(900)000-00-00")
    assert second["id"] == first["id"]
    count = db_conn.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"]
    assert count == 1


def test_upsert_client_invalid_phone_raises_422(db_conn):
    with pytest.raises(HTTPException) as exc:
        upsert_client(db_conn, "Иван Петров", "8 900 000-00-00")
    assert exc.value.status_code == 422


# --- upsert_master ---

def test_upsert_master_id_formula(db_conn):
    row = upsert_master(db_conn, "Test Master")
    assert row["id"] == "master:test-master"
    assert row["name"] == "Test Master"


def test_upsert_master_is_idempotent_by_id(db_conn):
    upsert_master(db_conn, "Test Master")
    upsert_master(db_conn, "Test Master")
    count = db_conn.execute("SELECT COUNT(*) AS n FROM masters").fetchone()["n"]
    assert count == 1


# --- get_request_or_404 ---

def test_get_request_or_404_missing_raises(db_conn):
    with pytest.raises(HTTPException) as exc:
        get_request_or_404(db_conn, 999999)
    assert exc.value.status_code == 404


def test_get_request_or_404_returns_existing_row(client):
    created = client.post(
        "/api/requests",
        json={
            "clientName": "Иван Петров",
            "phone": VALID_PHONE,
            "device": "iPhone 12",
            "repairId": "battery",
            "comment": "",
        },
    ).json()
    with get_db() as conn:
        row = get_request_or_404(conn, created["id"])
    assert row["id"] == created["id"]


# --- row_to_request / rows_to_messages ---

def test_row_to_request_without_conn_has_empty_messages(client):
    created = client.post(
        "/api/requests",
        json={
            "clientName": "Иван Петров",
            "phone": VALID_PHONE,
            "device": "iPhone 12",
            "repairId": "battery",
            "comment": "",
        },
    ).json()
    with get_db() as conn:
        row = get_request_or_404(conn, created["id"])
        result = row_to_request(row)
    assert result["messages"] == []
    assert result["assigneeName"] == ""


def test_rows_to_messages_ordered_by_id(accepted_request, client):
    request_json, master_id, master_name = accepted_request()
    request_id = request_json["id"]
    client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Первое"},
    )
    client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "master", "author": master_name, "masterId": master_id, "text": "Второе"},
    )
    with get_db() as conn:
        messages = rows_to_messages(conn, request_id)
    assert [m["text"] for m in messages] == ["Первое", "Второе"]
    assert messages[0]["from"] == "client"
    assert messages[1]["from"] == "master"
    assert set(messages[0]) == {"id", "from", "author", "text", "createdAt"}
    assert messages[0]["id"] < messages[1]["id"]
