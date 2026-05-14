"""Юнит-тесты чистых функций backend/validators.py."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.validators import (
    clean_phone,
    compact_spaces,
    is_valid_phone,
    normalize_phone,
    parse_client_datetime,
    validate_device,
    validate_master_code,
    validate_master_id,
    validate_name,
    validate_not_past,
    validate_phone,
    validate_safe_text,
)


# --- compact_spaces / clean_phone ---

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("  a   b  ", "a b"),
        ("", ""),
        (None, ""),
        ("single", "single"),
        ("\t\na\t b\n", "a b"),
        ("one  two   three", "one two three"),
    ],
)
def test_compact_spaces(raw, expected):
    assert compact_spaces(raw) == expected


def test_clean_phone_delegates_to_compact_spaces():
    assert clean_phone("  +7  900  ") == "+7 900"


# --- is_valid_phone ---

@pytest.mark.parametrize(
    "phone",
    [
        "+7 900 000-00-00",
        "+79000000000",
        "+7(900)000-00-00",
        "+7 900 000 00 00",
        "+7-900-000-00-00",
    ],
)
def test_is_valid_phone_accepts(phone):
    assert is_valid_phone(phone) is True


@pytest.mark.parametrize(
    "phone",
    [
        "8 900 000-00-00",
        "+7 900 000-00-0",
        "+7 900 000-00-000",
        "+7 90 000-00-00",
        "",
        "phone",
        "+7abcdefghij",
    ],
)
def test_is_valid_phone_rejects(phone):
    assert is_valid_phone(phone) is False


# --- normalize_phone ---

@pytest.mark.parametrize(
    "phone",
    ["+7 900 000-00-00", "+7(900)000-00-00", "+79000000000", "+7-900-000-00-00"],
)
def test_normalize_phone_valid_returns_digits(phone):
    assert normalize_phone(phone) == "79000000000"


@pytest.mark.parametrize("phone", ["8 900 000-00-00", "", "garbage", "+7 90 000-00-00"])
def test_normalize_phone_invalid_returns_empty_string(phone):
    assert normalize_phone(phone) == ""


# --- validate_name ---

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Иван", "Иван"),
        ("Анна-Мария", "Анна-Мария"),
        ("John Smith", "John Smith"),
        ("  Пётр   Ильич  ", "Пётр Ильич"),
    ],
)
def test_validate_name_accepts(raw, expected):
    assert validate_name(raw) == expected


@pytest.mark.parametrize("raw", ["A", "", "1van", "Ivan2", "Ivan!", "x" * 81])
def test_validate_name_rejects(raw):
    with pytest.raises(ValueError):
        validate_name(raw)


# --- validate_phone ---

def test_validate_phone_accepts_and_cleans():
    assert validate_phone("  +7 900 000-00-00  ") == "+7 900 000-00-00"


@pytest.mark.parametrize("raw", ["8 900 000-00-00", "not a phone", ""])
def test_validate_phone_rejects(raw):
    with pytest.raises(ValueError):
        validate_phone(raw)


# --- validate_device ---

@pytest.mark.parametrize(
    "raw",
    ["iPhone 13", "Ноутбук Asus X550", "MacBook Air (2020)", "Device-1 + 2 / 3"],
)
def test_validate_device_accepts(raw):
    assert validate_device(raw) == compact_spaces(raw)


@pytest.mark.parametrize(
    "raw", ["<script>", "Device{}", "Device\\back", "", ".start", "!bad", "x" * 121]
)
def test_validate_device_rejects(raw):
    with pytest.raises(ValueError):
        validate_device(raw)


# --- validate_safe_text ---

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Обычный текст", "Обычный текст"),
        ("", ""),
        (None, ""),
        ("  spaced   out  ", "spaced out"),
        ("a" * 2000, "a" * 2000),
    ],
)
def test_validate_safe_text_accepts(raw, expected):
    assert validate_safe_text(raw) == expected


@pytest.mark.parametrize(
    "raw", ["has <tag>", "with >angle", "curly{brace}", "back\\slash", "a" * 2001]
)
def test_validate_safe_text_rejects(raw):
    with pytest.raises(ValueError):
        validate_safe_text(raw)


# --- parse_client_datetime ---

def test_parse_client_datetime_none_and_empty():
    assert parse_client_datetime(None) is None
    assert parse_client_datetime("") is None


def test_parse_client_datetime_naive_gets_utc():
    parsed = parse_client_datetime("2030-01-01T10:00:00")
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(None)


def test_parse_client_datetime_trailing_z():
    parsed = parse_client_datetime("2030-01-01T10:00:00Z")
    assert parsed == datetime(2030, 1, 1, 10, 0, 0, tzinfo=timezone.utc)


def test_parse_client_datetime_preserves_offset():
    parsed = parse_client_datetime("2030-01-01T10:00:00+03:00")
    assert parsed.utcoffset().total_seconds() == 3 * 3600


def test_parse_client_datetime_garbage_raises():
    with pytest.raises(ValueError):
        parse_client_datetime("not-a-date")


# --- validate_not_past ---

def test_validate_not_past_none_and_empty():
    assert validate_not_past(None) is None
    assert validate_not_past("") is None


def test_validate_not_past_future_ok():
    assert validate_not_past("2099-01-01T00:00:00Z") == "2099-01-01T00:00:00Z"


def test_validate_not_past_past_raises():
    with pytest.raises(ValueError):
        validate_not_past("2000-01-01T00:00:00Z")


# --- validate_master_id ---

def test_validate_master_id_none_passthrough():
    assert validate_master_id(None) is None


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("master:иван", "master:иван"),
        ("master:john-smith", "master:john-smith"),
        ("master:abc123", "master:abc123"),
        ("  master:abc  ", "master:abc"),
    ],
)
def test_validate_master_id_accepts(raw, expected):
    assert validate_master_id(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["master:", "иван", "master:has space", "master:<bad>", "master:" + "x" * 111],
)
def test_validate_master_id_rejects(raw):
    with pytest.raises(ValueError):
        validate_master_id(raw)


# --- validate_master_code ---

@pytest.mark.parametrize(
    "raw, expected",
    [("abcd", "abcd"), ("Code_12-34", "Code_12-34"), ("x" * 20, "x" * 20), ("  abcd  ", "abcd")],
)
def test_validate_master_code_accepts(raw, expected):
    assert validate_master_code(raw) == expected


@pytest.mark.parametrize("raw", ["abc", "x" * 21, "has space", "bad@char", ""])
def test_validate_master_code_rejects(raw):
    with pytest.raises(ValueError):
        validate_master_code(raw)
