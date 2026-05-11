from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from pydantic import field_validator

PHONE_PATTERN = re.compile(r"^\+7[\s\-]?\(?[0-9]{3}\)?[\s\-]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2}$")
NAME_PATTERN = re.compile(r"^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s\-]{1,79}$")
DEVICE_PATTERN = re.compile(r"^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\s\-+./()]{1,119}$")
SAFE_TEXT_PATTERN = re.compile(r"^[^<>\\{}]{0,2000}$")


def compact_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def clean_phone(value: str) -> str:
    return compact_spaces(value)


def is_valid_phone(value: str) -> bool:
    return bool(PHONE_PATTERN.fullmatch(clean_phone(value)))


def normalize_phone(value: str) -> str:
    cleaned = clean_phone(value)
    if not is_valid_phone(cleaned):
        return ""
    return re.sub(r"\D+", "", cleaned)


def validate_name(value: str) -> str:
    value = compact_spaces(value)
    if not NAME_PATTERN.fullmatch(value):
        raise ValueError("Имя должно содержать только буквы, пробелы или дефис, от 2 до 80 символов.")
    return value


def validate_phone(value: str) -> str:
    value = clean_phone(value)
    if not is_valid_phone(value):
        raise ValueError("Телефон должен быть в формате +7 900 000-00-00.")
    return value


def validate_device(value: str) -> str:
    value = compact_spaces(value)
    if not DEVICE_PATTERN.fullmatch(value):
        raise ValueError("Устройство должно начинаться с буквы/цифры и не содержать HTML-символы.")
    return value


def validate_safe_text(value: str | None) -> str:
    value = compact_spaces(value or "")
    if not SAFE_TEXT_PATTERN.fullmatch(value):
        raise ValueError("Комментарий не должен содержать HTML-скобки, фигурные скобки или обратный слеш.")
    return value


def parse_client_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def validate_not_past(value: str | None) -> str | None:
    if not value:
        return None
    parsed = parse_client_datetime(value)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    if parsed and parsed < now:
        raise ValueError("Дата и время заявки не могут быть раньше текущего момента.")
    return value


def strip_string(value: Any) -> Any:
    return compact_spaces(value) if isinstance(value, str) else value

MASTER_ID_PATTERN = re.compile(r"^master:[a-zа-яё0-9-]{1,110}$", re.IGNORECASE)
CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,20}$")


def validate_master_id(value: str | None) -> str | None:
    if value is None:
        return value
    value = compact_spaces(value)
    if not MASTER_ID_PATTERN.fullmatch(value):
        raise ValueError("Некорректный ID мастера.")
    return value


def validate_master_code(value: str) -> str:
    value = compact_spaces(value)
    if not CODE_PATTERN.fullmatch(value):
        raise ValueError("Код мастера должен содержать 4–20 латинских букв, цифр, _ или -.")
    return value
