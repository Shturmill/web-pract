"""Интеграционные тесты роутера заявок (backend/routers/requests.py).

Покрывает жизненный цикл заявки open -> in_progress -> done и обработку
ошибок 403/404/409/422.
"""

from __future__ import annotations

import pytest

from backend.constants import REPAIR_OPTIONS

VALID_PHONE = "+7 900 000-00-00"
VALID_PHONE_NORMALIZED = "79000000000"
OTHER_PHONE = "+7 911 111-11-11"
MASTER_ID = "master:test-master"
MASTER_NAME = "Test Master"
OTHER_MASTER_ID = "master:other-one"


def _payload(**overrides):
    base = {
        "clientName": "Иван Петров",
        "phone": VALID_PHONE,
        "device": "iPhone 12",
        "repairId": "battery",
        "preferredTime": None,
        "comment": "Быстро садится батарея",
    }
    base.update(overrides)
    return base


# --- создание ---

def test_create_request_happy_path(client):
    response = client.post("/api/requests", json=_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "open"
    assert data["assignee"] is None
    assert data["assigneeName"] == ""
    assert data["messages"] == []
    assert isinstance(data["id"], int) and data["id"] > 0
    battery = REPAIR_OPTIONS["battery"]
    assert data["repairTitle"] == battery["title"]
    assert data["priceFrom"] == battery["price_from"]
    assert data["repairDuration"] == battery["duration"]
    assert data["priceText"] == "от 890 ₽"


def test_create_request_ids_are_sequential_autoincrement(make_request):
    ids = [make_request()["id"] for _ in range(3)]
    assert ids == [1, 2, 3]


def test_create_request_upserts_client(client, make_request):
    make_request()
    listed = client.get("/api/requests/client", params={"phone": VALID_PHONE})
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_create_request_comment_empty_problem_falls_back_to_title(make_request):
    data = make_request(comment="")
    assert data["problem"] == REPAIR_OPTIONS["battery"]["title"]


def test_create_request_comment_used_as_problem(make_request):
    data = make_request(comment="Экран мигает")
    assert data["problem"] == "Экран мигает"


@pytest.mark.parametrize(
    "overrides",
    [
        {"repairId": "teleport"},
        {"phone": "8 900 000-00-00"},
        {"device": "<bad>"},
        {"clientName": "Ivan2"},
        {"preferredTime": "2000-01-01T00:00:00Z"},
    ],
)
def test_create_request_invalid_422(client, overrides):
    response = client.post("/api/requests", json=_payload(**overrides))
    assert response.status_code == 422


# --- списки ---

def test_list_client_requests_empty(client):
    response = client.get("/api/requests/client", params={"phone": VALID_PHONE})
    assert response.status_code == 200
    assert response.json() == []


def test_list_client_requests_returns_own(client, make_request):
    created = make_request()
    response = client.get("/api/requests/client", params={"phone": VALID_PHONE})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == created["id"]


def test_list_client_requests_invalid_phone_422(client):
    response = client.get("/api/requests/client", params={"phone": "8 900 000-00-00"})
    assert response.status_code == 422


def test_list_client_requests_short_phone_422(client):
    response = client.get("/api/requests/client", params={"phone": "+7 900"})
    assert response.status_code == 422


def test_list_open_requests(client, make_request, accepted_request):
    make_request()
    accepted_request()
    response = client.get("/api/requests/open")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert all(item["status"] == "open" for item in data)


def test_list_master_requests(client, accepted_request):
    accepted_request()
    response = client.get("/api/requests/master", params={"masterId": MASTER_ID})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "in_progress"
    assert data[0]["assignee"] == MASTER_ID


def test_list_master_requests_unknown_master_empty(client, accepted_request):
    accepted_request()
    response = client.get("/api/requests/master", params={"masterId": OTHER_MASTER_ID})
    assert response.status_code == 200
    assert response.json() == []


def test_list_master_requests_short_master_id_422(client):
    response = client.get("/api/requests/master", params={"masterId": "m"})
    assert response.status_code == 422


# --- accept ---

def test_accept_request_success(client, make_request):
    created = make_request()
    response = client.post(
        f"/api/requests/{created['id']}/accept",
        json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "in_progress"
    assert data["assignee"] == MASTER_ID
    assert data["assigneeName"] == MASTER_NAME
    assert data["updatedAt"] >= data["createdAt"]


def test_accept_request_upserts_master(client, make_request):
    created = make_request()
    client.post(
        f"/api/requests/{created['id']}/accept",
        json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
    )
    listed = client.get("/api/requests/master", params={"masterId": MASTER_ID})
    assert len(listed.json()) == 1


def test_accept_request_double_accept_conflict(client, make_request):
    created = make_request()
    first = client.post(
        f"/api/requests/{created['id']}/accept",
        json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/requests/{created['id']}/accept",
        json={"masterId": OTHER_MASTER_ID, "masterName": "Other One"},
    )
    assert second.status_code == 409
    assert "уже забрал" in second.json()["detail"]


def test_accept_request_missing_id_404(client):
    response = client.post(
        "/api/requests/999999/accept",
        json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Заявка не найдена."


@pytest.mark.parametrize(
    "body",
    [
        {"masterId": "bad-format", "masterName": MASTER_NAME},
        {"masterId": MASTER_ID, "masterName": "bad2name"},
    ],
)
def test_accept_request_invalid_body_422(client, make_request, body):
    created = make_request()
    response = client.post(f"/api/requests/{created['id']}/accept", json=body)
    assert response.status_code == 422


# --- messages ---

def test_message_client_happy_path(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Когда готово?"},
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["messages"]) == 1
    assert data["messages"][0]["from"] == "client"
    assert data["messages"][0]["text"] == "Когда готово?"


def test_message_master_happy_path(client, accepted_request):
    request_json, master_id, master_name = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "master", "author": master_name, "masterId": master_id, "text": "Завтра"},
    )
    assert response.status_code == 201
    assert response.json()["messages"][0]["from"] == "master"


def test_message_on_open_request_409(client, make_request):
    created = make_request()
    response = client.post(
        f"/api/requests/{created['id']}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Привет"},
    )
    assert response.status_code == 409
    assert "в работе" in response.json()["detail"]


def test_message_on_done_request_409(client, accepted_request):
    request_json, master_id, _ = accepted_request()
    client.post(f"/api/requests/{request_json['id']}/done", json={"masterId": master_id})
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Привет"},
    )
    assert response.status_code == 409


def test_message_client_wrong_phone_403(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "client", "author": "Чужой Клиент", "phone": OTHER_PHONE, "text": "Привет"},
    )
    assert response.status_code == 403
    assert "не относится" in response.json()["detail"]


def test_message_client_missing_phone_403(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "text": "Привет"},
    )
    assert response.status_code == 403


def test_message_master_wrong_id_403(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "master", "author": "Other One", "masterId": OTHER_MASTER_ID, "text": "Привет"},
    )
    assert response.status_code == 403
    assert "в работе текущего мастера" in response.json()["detail"]


def test_message_master_missing_id_403(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/messages",
        json={"senderRole": "master", "author": "Test Master", "text": "Привет"},
    )
    assert response.status_code == 403


def test_message_missing_request_404(client):
    response = client.post(
        "/api/requests/999999/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Привет"},
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": ""},
        {"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "<b>hi</b>"},
        {"senderRole": "client", "author": "1bad", "phone": VALID_PHONE, "text": "Привет"},
    ],
)
def test_message_invalid_body_422(client, accepted_request, body):
    request_json, _, _ = accepted_request()
    response = client.post(f"/api/requests/{request_json['id']}/messages", json=body)
    assert response.status_code == 422


def test_messages_ordered_and_updated_at_advances(client, accepted_request):
    request_json, master_id, master_name = accepted_request()
    request_id = request_json["id"]
    client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Первое"},
    )
    final = client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "master", "author": master_name, "masterId": master_id, "text": "Второе"},
    ).json()
    texts = [m["text"] for m in final["messages"]]
    assert texts == ["Первое", "Второе"]
    ids = [m["id"] for m in final["messages"]]
    assert ids == sorted(ids)
    assert final["updatedAt"] >= request_json["updatedAt"]


# --- done ---

def test_done_success(client, accepted_request):
    request_json, master_id, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/done", json={"masterId": master_id}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "done"


def test_done_on_open_request_409(client, make_request):
    created = make_request()
    response = client.post(
        f"/api/requests/{created['id']}/done", json={"masterId": MASTER_ID}
    )
    assert response.status_code == 409
    assert "свою заявку в работе" in response.json()["detail"]


def test_done_already_done_409(client, accepted_request):
    request_json, master_id, _ = accepted_request()
    client.post(f"/api/requests/{request_json['id']}/done", json={"masterId": master_id})
    response = client.post(
        f"/api/requests/{request_json['id']}/done", json={"masterId": master_id}
    )
    assert response.status_code == 409


def test_done_by_different_master_409(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/done", json={"masterId": OTHER_MASTER_ID}
    )
    assert response.status_code == 409


def test_done_missing_id_returns_409_not_404(client):
    """mark_done проверяет rowcount до поиска заявки -> 409, не 404."""
    response = client.post("/api/requests/999999/done", json={"masterId": MASTER_ID})
    assert response.status_code == 409


def test_done_invalid_master_id_422(client, accepted_request):
    request_json, _, _ = accepted_request()
    response = client.post(
        f"/api/requests/{request_json['id']}/done", json={"masterId": "bad"}
    )
    assert response.status_code == 422


# --- сквозной жизненный цикл ---

def test_full_lifecycle(client, make_request):
    created = make_request()
    request_id = created["id"]
    assert created["status"] == "open"

    accepted = client.post(
        f"/api/requests/{request_id}/accept",
        json={"masterId": MASTER_ID, "masterName": MASTER_NAME},
    ).json()
    assert accepted["status"] == "in_progress"

    client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "client", "author": "Иван Петров", "phone": VALID_PHONE, "text": "Вопрос"},
    )
    after_master_msg = client.post(
        f"/api/requests/{request_id}/messages",
        json={"senderRole": "master", "author": MASTER_NAME, "masterId": MASTER_ID, "text": "Ответ"},
    ).json()
    assert len(after_master_msg["messages"]) == 2

    done = client.post(
        f"/api/requests/{request_id}/done", json={"masterId": MASTER_ID}
    ).json()
    assert done["status"] == "done"

    assert client.get("/api/requests/open").json() == []
    assert client.get("/api/requests/master", params={"masterId": MASTER_ID}).json() == []
