from __future__ import annotations

MASTER_ACCESS_CODE = "1234"

REPAIR_OPTIONS: dict[str, dict[str, object]] = {
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

STATUS_OPEN = "open"
STATUS_PROGRESS = "in_progress"
STATUS_DONE = "done"
