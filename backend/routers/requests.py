from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..constants import REPAIR_OPTIONS
from ..database import get_db
from ..repository import format_price, get_request_or_404, row_to_request, upsert_client, upsert_master, utc_now_iso
from ..schemas import AcceptRequestIn, DoneRequestIn, MessageCreateIn, RequestCreateIn
from ..validators import normalize_phone

router = APIRouter(prefix="/api/requests", tags=["requests"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_request(payload: RequestCreateIn) -> dict:
    repair = REPAIR_OPTIONS[payload.repairId]
    phone_normalized = normalize_phone(payload.phone)
    now = utc_now_iso()
    problem = payload.comment or str(repair["title"])

    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        upsert_client(conn, payload.clientName, payload.phone)
        cursor = conn.execute(
            """
            INSERT INTO requests (
                client_name, phone, owner_phone, owner_name, device, repair_id, repair_title,
                price_from, price_text, repair_duration, preferred_time, comment, problem,
                status, assignee, assignee_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, '', ?, ?)
            """,
            (
                payload.clientName,
                payload.phone,
                phone_normalized,
                payload.clientName,
                payload.device,
                payload.repairId,
                str(repair["title"]),
                int(repair["price_from"]),
                format_price(int(repair["price_from"])),
                str(repair["duration"]),
                payload.preferredTime,
                payload.comment or "",
                problem,
                now,
                now,
            ),
        )
        request_id = cursor.lastrowid
        conn.commit()
        row = get_request_or_404(conn, request_id)
        return row_to_request(row, conn)


@router.get("/client")
def get_client_requests(phone: str = Query(min_length=12, max_length=30)) -> list[dict]:
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        raise HTTPException(status_code=422, detail="Телефон должен быть в формате +7 900 000-00-00.")
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE owner_phone = ? ORDER BY updated_at DESC",
            (phone_normalized,),
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@router.get("/open")
def get_open_requests() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE status = 'open' ORDER BY created_at DESC"
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@router.get("/master")
def get_master_requests(masterId: str = Query(min_length=2, max_length=120)) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM requests WHERE status = 'in_progress' AND assignee = ? ORDER BY updated_at DESC",
            (masterId,),
        ).fetchall()
        return [row_to_request(row, conn) for row in rows]


@router.post("/{request_id}/accept")
def accept_request(request_id: int, payload: AcceptRequestIn) -> dict:
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


@router.post("/{request_id}/messages", status_code=status.HTTP_201_CREATED)
def add_message(request_id: int, payload: MessageCreateIn) -> dict:
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


@router.post("/{request_id}/done")
def mark_done(request_id: int, payload: DoneRequestIn) -> dict:
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
