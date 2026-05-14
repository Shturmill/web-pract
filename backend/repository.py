from __future__ import annotations

import re
from datetime import datetime, timezone
from sqlite3 import Connection, Row
from typing import Any

from fastapi import HTTPException

from .constants import REPAIR_OPTIONS
from .validators import normalize_phone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-zа-яё0-9]+", "-", value, flags=re.IGNORECASE)
    return value.strip("-") or str(int(datetime.now().timestamp()))


def format_price(value: int | None) -> str:
    if value is None:
        return "—"
    return f"от {value:,} ₽".replace(",", " ")


def row_to_message(row: Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "from": row["sender_role"],
        "author": row["author"],
        "text": row["text"],
        "createdAt": row["created_at"],
    }


def rows_to_messages(conn: Connection, request_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, sender_role, author, text, created_at FROM messages WHERE request_id = ? ORDER BY id ASC",
        (request_id,),
    ).fetchall()
    return [row_to_message(row) for row in rows]


def row_to_request(row: Row, conn: Connection | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "client": row["client_name"],
        "clientName": row["client_name"],
        "phone": row["phone"],
        "ownerPhone": row["owner_phone"],
        "ownerName": row["owner_name"],
        "device": row["device"],
        "repairId": row["repair_id"],
        "repairTitle": row["repair_title"],
        "priceFrom": row["price_from"],
        "priceText": row["price_text"],
        "repairDuration": row["repair_duration"],
        "preferredTime": row["preferred_time"],
        "comment": row["comment"],
        "problem": row["problem"],
        "status": row["status"],
        "assignee": row["assignee"],
        "assigneeName": row["assignee_name"] or "",
        "messages": rows_to_messages(conn, row["id"]) if conn else [],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def get_request_or_404(conn: Connection, request_id: int) -> Row:
    row = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return row


def upsert_client(conn: Connection, name: str, phone: str) -> Row:
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        raise HTTPException(status_code=422, detail="Введите корректный телефон.")
    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO clients (name, phone, phone_normalized, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(phone_normalized) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          updated_at = excluded.updated_at
        """,
        (name, phone, phone_normalized, now, now),
    )
    return conn.execute("SELECT * FROM clients WHERE phone_normalized = ?", (phone_normalized,)).fetchone()


def upsert_master(conn: Connection, name: str) -> Row:
    master_id = f"master:{slugify(name)}"
    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO masters (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
        """,
        (master_id, name, now, now),
    )
    return conn.execute("SELECT * FROM masters WHERE id = ?", (master_id,)).fetchone()
