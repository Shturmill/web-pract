from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..constants import REPAIR_OPTIONS
from ..repository import format_price
from ..schemas import CalendarPriceOut, RepairOptionOut

router = APIRouter(prefix="/api", tags=["catalog"])


def price_multiplier(days_ahead: int) -> tuple[float, str]:
    if days_ahead == 0:
        return 1.35, "срочная запись сегодня"
    if days_ahead <= 2:
        return 1.25, "ближайшие дни дороже"
    if days_ahead <= 5:
        return 1.15, "повышенный спрос"
    if days_ahead <= 10:
        return 1.05, "стандартная загрузка"
    return 1.0, "плановая запись"


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/repair-options", response_model=list[RepairOptionOut])
def get_repair_options() -> list[RepairOptionOut]:
    return [
        RepairOptionOut(id=key, title=str(value["title"]), priceFrom=int(value["price_from"]), duration=str(value["duration"]))
        for key, value in REPAIR_OPTIONS.items()
    ]


@router.get("/calculator/prices", response_model=list[CalendarPriceOut])
def get_calendar_prices(
    serviceId: str = Query(min_length=1, max_length=40),
    days: int = Query(default=21, ge=7, le=45),
) -> list[CalendarPriceOut]:
    service = REPAIR_OPTIONS.get(serviceId)
    if service is None:
        raise HTTPException(status_code=422, detail="Выбран неизвестный тип ремонта.")
    base = int(service["price_from"])
    today = date.today()
    result: list[CalendarPriceOut] = []
    for offset in range(days):
        current = today + timedelta(days=offset)
        multiplier, reason = price_multiplier(offset)
        price = int(round(base * multiplier / 10) * 10)
        result.append(
            CalendarPriceOut(
                date=current.isoformat(),
                label=current.strftime("%d.%m"),
                price=price,
                priceText=format_price(price),
                multiplier=multiplier,
                reason=reason,
            )
        )
    return result
