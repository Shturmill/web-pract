"""Интеграционные тесты роутера каталога (backend/routers/catalog.py)."""

from __future__ import annotations

import re
from datetime import date

import pytest

from backend.constants import REPAIR_OPTIONS


# --- /api/health ---

def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- /api/repair-options ---

def test_repair_options_returns_all(client):
    response = client.get("/api/repair-options")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(REPAIR_OPTIONS)
    assert {item["id"] for item in data} == set(REPAIR_OPTIONS)
    for item in data:
        assert set(item) == {"id", "title", "priceFrom", "duration"}
        assert isinstance(item["priceFrom"], int)
    diagnostic = next(item for item in data if item["id"] == "diagnostic")
    assert diagnostic["priceFrom"] == 0


# --- /api/calculator/prices ---

def test_calculator_prices_default_length(client):
    response = client.get("/api/calculator/prices?serviceId=display")
    assert response.status_code == 200
    assert len(response.json()) == 21


@pytest.mark.parametrize("days", [7, 21, 45])
def test_calculator_prices_respects_days(client, days):
    response = client.get(f"/api/calculator/prices?serviceId=display&days={days}")
    assert response.status_code == 200
    assert len(response.json()) == days


@pytest.mark.parametrize("days", [6, 46, 0, -1])
def test_calculator_prices_days_out_of_bounds_422(client, days):
    response = client.get(f"/api/calculator/prices?serviceId=display&days={days}")
    assert response.status_code == 422


def test_calculator_prices_missing_service_id_422(client):
    response = client.get("/api/calculator/prices")
    assert response.status_code == 422


def test_calculator_prices_empty_service_id_422(client):
    response = client.get("/api/calculator/prices?serviceId=")
    assert response.status_code == 422


def test_calculator_prices_unknown_service_id_422(client):
    response = client.get("/api/calculator/prices?serviceId=teleport&days=10")
    assert response.status_code == 422
    assert "тип ремонта" in response.json()["detail"]


@pytest.mark.parametrize(
    "offset, expected_multiplier",
    [
        (0, 1.35),
        (1, 1.25),
        (2, 1.25),
        (3, 1.15),
        (5, 1.15),
        (6, 1.05),
        (10, 1.05),
        (11, 1.0),
        (20, 1.0),
    ],
)
def test_calculator_prices_multiplier_tiers(client, offset, expected_multiplier):
    data = client.get("/api/calculator/prices?serviceId=display&days=21").json()
    assert data[offset]["multiplier"] == expected_multiplier


def test_calculator_prices_price_math_and_shape(client):
    data = client.get("/api/calculator/prices?serviceId=display&days=21").json()
    first = data[0]
    assert set(first) == {"date", "label", "price", "priceText", "multiplier", "reason"}
    # display base 2490, multiplier 1.35 -> round(2490*1.35/10)*10 = 3360
    assert first["price"] == 3360
    assert first["priceText"] == "от 3 360 ₽"
    assert first["date"] == date.today().isoformat()
    assert first["label"] == date.today().strftime("%d.%m")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", first["date"])
    assert re.fullmatch(r"\d{2}\.\d{2}", first["label"])
