from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .constants import REPAIR_OPTIONS
from .validators import validate_device, validate_master_code, validate_master_id, validate_name, validate_not_past, validate_phone, validate_safe_text


class RepairOptionOut(BaseModel):
    id: str
    title: str
    priceFrom: int
    duration: str


class CalendarPriceOut(BaseModel):
    date: str
    label: str
    price: int
    priceText: str
    multiplier: float
    reason: str


class ClientProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=12, max_length=30)

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_name(value)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str) -> str:
        return validate_phone(value)


class ClientProfileOut(BaseModel):
    id: int
    role: Literal["client"] = "client"
    name: str
    phone: str
    phoneNormalized: str


class MasterLoginIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=4, max_length=20)

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_name(value)

    @field_validator("code")
    @classmethod
    def code_is_valid(cls, value: str) -> str:
        return validate_master_code(value)


class MasterProfileOut(BaseModel):
    id: str
    role: Literal["master"] = "master"
    name: str


class RequestCreateIn(BaseModel):
    clientName: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=12, max_length=30)
    device: str = Field(min_length=2, max_length=120)
    repairId: str = Field(min_length=1, max_length=40)
    preferredTime: str | None = Field(default=None, max_length=40)
    comment: str | None = Field(default="", max_length=2000)

    @field_validator("clientName")
    @classmethod
    def client_name_is_valid(cls, value: str) -> str:
        return validate_name(value)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str) -> str:
        return validate_phone(value)

    @field_validator("device")
    @classmethod
    def device_is_valid(cls, value: str) -> str:
        return validate_device(value)

    @field_validator("repairId")
    @classmethod
    def repair_id_is_valid(cls, value: str) -> str:
        if value not in REPAIR_OPTIONS:
            raise ValueError("Выбран неизвестный тип ремонта.")
        return value

    @field_validator("preferredTime")
    @classmethod
    def preferred_time_is_valid(cls, value: str | None) -> str | None:
        return validate_not_past(value)

    @field_validator("comment")
    @classmethod
    def comment_is_valid(cls, value: str | None) -> str:
        return validate_safe_text(value)


class AcceptRequestIn(BaseModel):
    masterId: str = Field(min_length=2, max_length=120)
    masterName: str = Field(min_length=2, max_length=80)

    @field_validator("masterName")
    @classmethod
    def master_name_is_valid(cls, value: str) -> str:
        return validate_name(value)

    @field_validator("masterId")
    @classmethod
    def master_id_is_valid(cls, value: str) -> str:
        return validate_master_id(value) or value


class MessageCreateIn(BaseModel):
    senderRole: Literal["client", "master"]
    author: str = Field(min_length=2, max_length=80)
    text: str = Field(min_length=1, max_length=1000)
    phone: str | None = Field(default=None, max_length=30)
    masterId: str | None = Field(default=None, max_length=120)

    @field_validator("author")
    @classmethod
    def author_is_valid(cls, value: str) -> str:
        return validate_name(value)

    @field_validator("text")
    @classmethod
    def text_is_valid(cls, value: str) -> str:
        return validate_safe_text(value)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return validate_phone(value)

    @field_validator("masterId")
    @classmethod
    def master_id_is_valid(cls, value: str | None) -> str | None:
        return validate_master_id(value)


class DoneRequestIn(BaseModel):
    masterId: str = Field(min_length=2, max_length=120)

    @field_validator("masterId")
    @classmethod
    def master_id_is_valid(cls, value: str) -> str:
        return validate_master_id(value) or value
