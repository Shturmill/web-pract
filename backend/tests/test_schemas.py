"""Юнит-тесты Pydantic-моделей backend/schemas.py."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.constants import REPAIR_OPTIONS
from backend.schemas import (
    AcceptRequestIn,
    ClientProfileIn,
    DoneRequestIn,
    MasterLoginIn,
    MessageCreateIn,
    RequestCreateIn,
)

VALID_PHONE = "+7 900 000-00-00"


# --- ClientProfileIn ---

def test_client_profile_in_valid():
    model = ClientProfileIn(name="Иван Петров", phone=VALID_PHONE)
    assert model.name == "Иван Петров"
    assert model.phone == VALID_PHONE


def test_client_profile_in_compacts_name():
    model = ClientProfileIn(name="  Иван   Петров  ", phone=VALID_PHONE)
    assert model.name == "Иван Петров"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"name": "Ivan2", "phone": VALID_PHONE},
        {"name": "Иван Петров", "phone": "8 900 000-00-00"},
        {"name": "Иван Петров", "phone": "+7 900"},
        {"name": "I", "phone": VALID_PHONE},
    ],
)
def test_client_profile_in_rejects(kwargs):
    with pytest.raises(ValidationError):
        ClientProfileIn(**kwargs)


# --- MasterLoginIn ---

def test_master_login_in_valid():
    model = MasterLoginIn(name="Test Master", code="abcd1234")
    assert model.name == "Test Master"
    assert model.code == "abcd1234"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"name": "Test Master", "code": "abc"},
        {"name": "Test Master", "code": "bad@code"},
        {"name": "1bad", "code": "abcd1234"},
    ],
)
def test_master_login_in_rejects(kwargs):
    with pytest.raises(ValidationError):
        MasterLoginIn(**kwargs)


# --- RequestCreateIn ---

def _request_kwargs(**overrides):
    base = {
        "clientName": "Иван Петров",
        "phone": VALID_PHONE,
        "device": "iPhone 12",
        "repairId": "battery",
        "preferredTime": None,
        "comment": "Текст без спецсимволов",
    }
    base.update(overrides)
    return base


def test_request_create_in_valid():
    model = RequestCreateIn(**_request_kwargs())
    assert model.repairId == "battery"
    assert model.preferredTime is None


@pytest.mark.parametrize("repair_id", sorted(REPAIR_OPTIONS.keys()))
def test_request_create_in_accepts_all_known_repair_ids(repair_id):
    model = RequestCreateIn(**_request_kwargs(repairId=repair_id))
    assert model.repairId == repair_id


def test_request_create_in_unknown_repair_id_rejected():
    with pytest.raises(ValidationError):
        RequestCreateIn(**_request_kwargs(repairId="teleport"))


def test_request_create_in_future_preferred_time_ok():
    model = RequestCreateIn(**_request_kwargs(preferredTime="2099-01-01T10:00:00Z"))
    assert model.preferredTime == "2099-01-01T10:00:00Z"


def test_request_create_in_past_preferred_time_rejected():
    with pytest.raises(ValidationError):
        RequestCreateIn(**_request_kwargs(preferredTime="2000-01-01T00:00:00Z"))


@pytest.mark.parametrize("comment", ["<script>", "a{b}", "back\\slash", "a" * 2001])
def test_request_create_in_bad_comment_rejected(comment):
    with pytest.raises(ValidationError):
        RequestCreateIn(**_request_kwargs(comment=comment))


@pytest.mark.parametrize(
    "overrides",
    [
        {"clientName": "Ivan2"},
        {"phone": "8 900 000-00-00"},
        {"device": "<bad>"},
    ],
)
def test_request_create_in_bad_fields_rejected(overrides):
    with pytest.raises(ValidationError):
        RequestCreateIn(**_request_kwargs(**overrides))


# --- AcceptRequestIn ---

def test_accept_request_in_valid():
    model = AcceptRequestIn(masterId="master:test-master", masterName="Test Master")
    assert model.masterId == "master:test-master"
    assert model.masterName == "Test Master"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"masterId": "not-a-master-id", "masterName": "Test Master"},
        {"masterId": "master:test-master", "masterName": "bad2name"},
        {"masterId": "m", "masterName": "Test Master"},
    ],
)
def test_accept_request_in_rejects(kwargs):
    with pytest.raises(ValidationError):
        AcceptRequestIn(**kwargs)


# --- MessageCreateIn ---

def test_message_create_in_valid_client():
    model = MessageCreateIn(
        senderRole="client", author="Иван Петров", text="Здравствуйте", phone=VALID_PHONE
    )
    assert model.senderRole == "client"
    assert model.masterId is None


def test_message_create_in_valid_master():
    model = MessageCreateIn(
        senderRole="master", author="Test Master", text="Готово", masterId="master:test-master"
    )
    assert model.senderRole == "master"
    assert model.phone is None


def test_message_create_in_allows_missing_phone_and_master_id():
    """Кросс-проверка владельца — логика роутера, не схемы."""
    model = MessageCreateIn(senderRole="client", author="Иван Петров", text="привет")
    assert model.phone is None
    assert model.masterId is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"senderRole": "admin", "author": "Иван Петров", "text": "hi"},
        {"senderRole": "client", "author": "Иван Петров", "text": ""},
        {"senderRole": "client", "author": "Иван Петров", "text": "<b>bold</b>"},
        {"senderRole": "client", "author": "1bad", "text": "hi"},
        {"senderRole": "client", "author": "Иван Петров", "text": "hi", "phone": "8 900 000-00-00"},
        {"senderRole": "master", "author": "Test Master", "text": "hi", "masterId": "bad"},
    ],
)
def test_message_create_in_rejects(kwargs):
    with pytest.raises(ValidationError):
        MessageCreateIn(**kwargs)


# --- DoneRequestIn ---

def test_done_request_in_valid():
    model = DoneRequestIn(masterId="master:test-master")
    assert model.masterId == "master:test-master"


def test_done_request_in_bad_master_id_rejected():
    with pytest.raises(ValidationError):
        DoneRequestIn(masterId="bad-format")
