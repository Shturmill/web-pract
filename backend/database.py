from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "servicebox.sqlite"))


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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
