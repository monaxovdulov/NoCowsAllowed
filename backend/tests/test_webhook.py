import json

from sqlmodel import Session, select

from app.config import DEVELOPMENT_WEBHOOK_SECRET
from app.models import GameSession, Player

SECRET_HEADERS = {"X-Telegram-Bot-Api-Secret-Token": DEVELOPMENT_WEBHOOK_SECRET}
BOT_USER = {"id": 8598845643, "is_bot": True, "first_name": "cawSkate"}
PLAYER_USER = {"id": 4242, "is_bot": False, "first_name": "Му", "username": "mu_cow"}


def _start_update(chat_id: int = 4242) -> dict:
    return {
        "update_id": 1,
        "message": {
            "message_id": 10,
            "date": 1_700_000_000,
            "chat": {"id": chat_id, "type": "private"},
            "from": PLAYER_USER,
            "text": "/start",
        },
    }


def _game_callback_update() -> dict:
    return {
        "update_id": 2,
        "callback_query": {
            "id": "cbq-1",
            "from": PLAYER_USER,
            "chat_instance": "ci-1",
            "game_short_name": "cowskate_dev",
            "message": {
                "message_id": 77,
                "date": 1_700_000_000,
                "chat": {"id": -100123, "type": "supergroup", "title": "Чат"},
                "from": BOT_USER,
            },
        },
    }


def test_webhook_rejects_without_secret(client) -> None:
    response = client.post("/telegram/webhook", json=_start_update())
    assert response.status_code == 401


def test_webhook_start_sends_game(client, game_gateway) -> None:
    response = client.post(
        "/telegram/webhook",
        content=json.dumps(_start_update()),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert len(game_gateway.sent_messages) == 1
    assert game_gateway.sent_games[0].chat_id == 4242


def test_webhook_game_command_in_group(client, game_gateway) -> None:
    update = _start_update(chat_id=-100123)
    update["message"]["chat"]["type"] = "supergroup"
    update["message"]["text"] = "/game@cowskate_dev_bot"
    response = client.post(
        "/telegram/webhook",
        content=json.dumps(update),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert game_gateway.sent_games[0].chat_id == -100123
    # В группе приветствие не шлём — только карточку игры.
    assert game_gateway.sent_messages == []


def test_webhook_play_button_answers_signed_url(client, engine, game_gateway) -> None:
    response = client.post(
        "/telegram/webhook",
        content=json.dumps(_game_callback_update()),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert len(game_gateway.answered_urls) == 1
    url = game_gateway.answered_urls[0].url
    assert url.startswith("http://localhost:8000/?s=v1.")

    with Session(engine) as db:
        player = db.get(Player, PLAYER_USER["id"])
        assert player is not None
        assert player.username == "mu_cow"
        session_row = db.exec(select(GameSession)).one()
        assert session_row.chat_id == -100123
        assert session_row.message_id == 77


def test_webhook_unknown_game_answers_alert(client, game_gateway) -> None:
    update = _game_callback_update()
    update["callback_query"]["game_short_name"] = "other_game"
    response = client.post(
        "/telegram/webhook",
        content=json.dumps(update),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert game_gateway.answered_urls == []
    assert len(game_gateway.answered_texts) == 1


def test_webhook_inline_query_answers_game(client, game_gateway) -> None:
    update = {
        "update_id": 4,
        "inline_query": {
            "id": "iq-1",
            "from": PLAYER_USER,
            "query": "",
            "offset": "",
            "chat_type": "supergroup",
        },
    }
    response = client.post(
        "/telegram/webhook",
        content=json.dumps(update),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert game_gateway.answered_inline == ["iq-1"]


def test_webhook_ignores_foreign_update_types(client) -> None:
    response = client.post(
        "/telegram/webhook",
        content=json.dumps({"update_id": 3, "poll": {"id": "x"}}),
        headers={**SECRET_HEADERS, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}
