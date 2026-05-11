from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, status

from ..constants import MASTER_ACCESS_CODE
from ..database import get_db
from ..repository import upsert_client, upsert_master
from ..schemas import ClientProfileIn, ClientProfileOut, MasterLoginIn, MasterProfileOut

router = APIRouter(prefix="/api", tags=["profiles"])


@router.post("/client/profile", response_model=ClientProfileOut)
def save_client_profile(payload: ClientProfileIn) -> ClientProfileOut:
    with get_db() as conn:
        row = upsert_client(conn, payload.name, payload.phone)
        return ClientProfileOut(id=row["id"], name=row["name"], phone=row["phone"], phoneNormalized=row["phone_normalized"])


@router.post("/master/login", response_model=MasterProfileOut)
def master_login(payload: MasterLoginIn) -> MasterProfileOut:
    expected_code = os.getenv("MASTER_ACCESS_CODE", MASTER_ACCESS_CODE)
    if payload.code != expected_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный код мастера.")
    with get_db() as conn:
        row = upsert_master(conn, payload.name)
        return MasterProfileOut(id=row["id"], name=row["name"])
