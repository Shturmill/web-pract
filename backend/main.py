from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
DATA_DIR = ROOT_DIR / "data"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "servicebox.sqlite"))
MASTER_ACCESS_CODE = os.getenv("MASTER_ACCESS_CODE", "1234")

REPAIR_OPTIONS: dict[str, dict[str, Any]] = {
    "diagnostic": {"title": "Диагностика устройства", "price_from": 0, "duration": "15–60 минут"},
    "display": {"title": "Замена дисплея / экрана", "price_from": 2490, "duration": "30–90 минут"},
    "battery": {"title": "Замена аккумулятора", "price_from": 890, "duration": "30–60 минут"},
    "connector": {"title": "Ремонт разъёма зарядки", "price_from": 1190, "duration": "от 60 минут"},
    "water": {"title": "Восстановление после влаги", "price_from": 1990, "duration": "от 90 минут"},
    "camera": {"title": "Замена камеры / стекла камеры", "price_from": 1490, "duration": "30–90 минут"},
    "speaker": {"title": "Динамик, микрофон или связь", "price_from": 990, "duration": "30–90 минут"},
    "software": {"title": "Настройка, прошивка или перенос данных", "price_from": 790, "duration": "30–120 минут"},
    "cleaning": {"title": "Чистка ноутбука / профилактика", "price_from": 1490, "duration": "45–90 минут"},
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_phone(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-zа-яё0-9]+", "-", value, flags=re.IGNORECASE)
    return value.strip("-") or str(int(datetime.now().timestamp()))


def format_price(value: int | None) -> str:
    if value is None:
        return "—"
    return f"от {value:,} ₽".replace(",", " ")


def parse_preferred_time(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Некорректная дата и время заявки.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def validate_not_past(value: str | None) -> None:
    parsed = parse_preferred_time(value)
    if parsed and parsed < datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Дата и время заявки не могут быть раньше текущего момента.")


@contextmanager
def get_db() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                phone_normalized TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS masters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY,
                client_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                owner_phone TEXT NOT NULL,
                owner_name TEXT NOT NULL,
                device TEXT NOT NULL,
                repair_id TEXT NOT NULL,
                repair_title TEXT NOT NULL,
                price_from INTEGER,
                price_text TEXT NOT NULL,
                repair_duration TEXT NOT NULL,
                preferred_time TEXT,
                comment TEXT,
                problem TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done')),
                assignee TEXT,
                assignee_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (assignee) REFERENCES masters(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id INTEGER NOT NULL,
                sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'master')),
                author TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
            CREATE INDEX IF NOT EXISTS idx_requests_owner_phone ON requests(owner_phone);
            CREATE INDEX IF NOT EXISTS idx_requests_assignee ON requests(assignee);
            CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages(request_id);
            """
        )


class ClientProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=3, max_length=30)

    @field_validator("name", "phone")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class ClientProfileOut(BaseModel):
    id: int
    role: Literal["client"] = "client"
    name: str
    phone: str
    phoneNormalized: str


class MasterLoginIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    code: str = Field(min_length=1, max_length=20)

    @field_validator("name", "code")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class MasterProfileOut(BaseModel):
    id: str
    role: Literal["master"] = "master"
    name: str


class RequestCreateIn(BaseModel):
    clientName: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=3, max_length=30)
    device: str = Field(min_length=1, max_length=120)
    repairId: str = Field(min_length=1, max_length=40)
    preferredTime: str | None = Field(default=None, max_length=40)
    comment: str | None = Field(default="", max_length=2000)

    @field_validator("clientName", "phone", "device", "repairId", "preferredTime", "comment")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class AcceptRequestIn(BaseModel):
    masterId: str = Field(min_length=1, max_length=120)
    masterName: str = Field(min_length=1, max_length=80)

    @field_validator("masterId", "masterName")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class MessageCreateIn(BaseModel):
    senderRole: Literal["client", "master"]
    author: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=1000)
    phone: str | None = Field(default=None, max_length=30)
    masterId: str | None = Field(default=None, max_length=120)

    @field_validator("author", "text", "phone", "masterId")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class DoneRequestIn(BaseModel):
    masterId: str = Field(min_length=1, max_length=120)

    @field_validator("masterId")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


def row_to_message(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "from": row["sender_role"],
        "author": row["author"],
        "text": row["text"],
        "createdAt": row["created_at"],
    }


def rows_to_messages(conn: sqlite3.Connection, request_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, sender_role, author, text, created_at FROM messages WHERE request_id = ? ORDER BY id ASC",
        (request_id,),
    ).fetchall()
    return [row_to_message(row) for row in rows]


def row_to_request(row: sqlite3.Row, conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    if conn is not None:
        messages = rows_to_messages(conn, row["id"])
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
        "messages": messages,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def get_request_or_404(conn: sqlite3.Connection, request_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена.")
    return row


def upsert_client(conn: sqlite3.Connection, name: str, phone: str) -> sqlite3.Row:
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


def upsert_master(conn: sqlite3.Connection, name: str) -> sqlite3.Row:
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


app = FastAPI(title="ServiceBox API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/repair-options")
def get_repair_options() -> list[dict[str, Any]]:
    return [
        {"id": key, "title": value["title"], "priceFrom": value["price_from"], "duration": value["duration"]}
        for key, value in REPAIR_OPTIONS.items()
    ]


@app.post("/api/client/profile", response_model=ClientProfileOut)
def save_client_profile(payload: ClientProfileIn) -> ClientProfileOut:
    with get_db() as conn:
        row = upsert_client(conn, payload.name, payload.phone)
        return ClientProfileOut(id=row["id"], name=row["name"], phone=row["phone"], phoneNormalized=row["phone_normalized"])


@app.post("/api/master/login", response_model=MasterProfileOut)
def master_login(payload: MasterLoginIn) -> MasterProfileOut:
    if payload.code != MASTER_ACCESS_CODE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный код мастера.")
    with get_db() as conn:
        row = upsert_master(conn, payload.name)
        return MasterProfileOut(id=row["id"], name=row["name"])


@app.post("/api/requests", status_code=status.HTTP_201_CREATED)
def create_request(payload: RequestCreateIn) -> dict[str, Any]:
    repair = REPAIR_OPTIONS.get(payload.repairId)
    if repair is None:
        raise HTTPException(status_code=422, detail="Выбран неизвестный тип ремонта.")
    validate_not_past(payload.preferredTime)
    phone_normalized = normalize_phone(payload.phone)
    if not phone_normalized:
        raise HTTPException(status_code=422, detail="Введите корректный телефон.")

    now = utc_now_iso()
    request_id = int(datetime.now().timestamp() * 1000)
    problem = payload.comment or repair["title"]

    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        upsert_client(conn, payload.clientName, payload.phone)
        conn.execute(
            """
            INSERT INTO requests (
                id, client_name, phone, owner_phone, owner_name, device, repair_id, repair_title,
                price_from, price_text, repair_duration, preferred_time, comment, problem,
                status, assignee, assignee_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, '', ?, ?)
            """,
            (
                request_id,
                payload.clientName,
                payload.phone,
                phone_normalized,
                payload.clientName,
                payload.device,
                payload.repairId,
                repair["title"],
                repair["price_from"],
                format_price(repair["price_from"]),
                repair["duration"],
                payload.preferredTime,
                payload.comment or "",
                problem,
                now,
                now,
            ),
        )
        conn.commit()
        row = get_request_or_404(conn, request_id)
        return row_to_request(row, conn)


@app.get("/api/requests/client")
def get_client_requests(phone: str = Query(min_length=3, max_length=30)) -> list[dict[str, Any]]:
    phone_normalized = normalize_phone(phone)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE owner_phone = ? ORDER BY created_at DESC",
            (phone_normalized,),
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@app.get("/api/requests/open")
def get_open_requests() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE status = 'open' ORDER BY created_at DESC"
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@app.get("/api/requests/master")
def get_master_requests(masterId: str = Query(min_length=1, max_length=120)) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE status = 'in_progress' AND assignee = ? ORDER BY created_at DESC",
            (masterId,),
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@app.post("/api/requests/{request_id}/accept")
def accept_request(request_id: int, payload: AcceptRequestIn) -> dict[str, Any]:
    now = utc_now_iso()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        upsert_master(conn, payload.masterName)
        result = conn.execute(
            """
            UPDATE requests
            SET status = 'in_progress', assignee = ?, assignee_name = ?, updated_at = ?
            WHERE id = ? AND status = 'open'
            """,
            (payload.masterId, payload.masterName, now, request_id),
        )
        if result.rowcount != 1:
            conn.rollback()
            row = conn.execute("SELECT status FROM requests WHERE id = ?", (request_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Заявка не найдена.")
            raise HTTPException(status_code=409, detail="Эту заявку уже забрал другой мастер.")
        conn.commit()
        row = get_request_or_404(conn, request_id)
        return row_to_request(row, conn)


@app.post("/api/requests/{request_id}/messages", status_code=status.HTTP_201_CREATED)
def add_message(request_id: int, payload: MessageCreateIn) -> dict[str, Any]:
    now = utc_now_iso()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        request = get_request_or_404(conn, request_id)
        if request["status"] != "in_progress":
            conn.rollback()
            raise HTTPException(status_code=409, detail="Переписка доступна только по заявке в работе.")

        if payload.senderRole == "client":
            if normalize_phone(payload.phone or "") != request["owner_phone"]:
                conn.rollback()
                raise HTTPException(status_code=403, detail="Заявка не относится к текущему клиенту.")
        else:
            if not payload.masterId or payload.masterId != request["assignee"]:
                conn.rollback()
                raise HTTPException(status_code=403, detail="Эта заявка не находится в работе текущего мастера.")

        conn.execute(
            "INSERT INTO messages (request_id, sender_role, author, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (request_id, payload.senderRole, payload.author, payload.text, now),
        )
        conn.execute("UPDATE requests SET updated_at = ? WHERE id = ?", (now, request_id))
        conn.commit()
        row = get_request_or_404(conn, request_id)
        return row_to_request(row, conn)


@app.post("/api/requests/{request_id}/done")
def mark_done(request_id: int, payload: DoneRequestIn) -> dict[str, Any]:
    now = utc_now_iso()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        result = conn.execute(
            """
            UPDATE requests
            SET status = 'done', updated_at = ?
            WHERE id = ? AND status = 'in_progress' AND assignee = ?
            """,
            (now, request_id, payload.masterId),
        )
        if result.rowcount != 1:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Завершить можно только свою заявку в работе.")
        conn.commit()
        row = get_request_or_404(conn, request_id)
        return row_to_request(row, conn)


@app.get("/")
def root() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
