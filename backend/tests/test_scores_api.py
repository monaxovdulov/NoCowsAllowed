from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.config import Settings
from app.models import Player, ScoreRun, ScoreVia
from app.modules.sessions import issue_session_token
from tests.helpers import signed_init_data

DEV_SESSION_SECRET = b"cowskate-dev-session-secret"
NOW = datetime(2026, 9, 29, 12, 0, 0, tzinfo=UTC)
USER = {
    "id": 4242,
    "first_name": "Му",
    "last_name": "Корова",
    "username": "mu_cow",
    "language_code": "ru",
}


def issue_token(settings: Settings, **overrides) -> str:
    kwargs = {
        "telegram_user_id": USER["id"],
        "chat_id": -100123,
        "message_id": 77,
        "inline_message_id": None,
        "now": NOW,
        "ttl_seconds": 3600,
    }
    kwargs.update(overrides)
    token, _ = issue_session_token(settings.game_session_secret, **kwargs)
    return token


def test_score_with_session_reports_native_and_stores(
    client, engine, game_gateway, settings
) -> None:
    token = issue_token(settings)
    response = client.post(
        "/api/score",
        json={"session": token, "init_data": None, "score": 321},
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "ok": True,
        "best": 321,
        "rank": 1,
        "prev_rank": None,
        "is_new_best": True,
    }

    assert len(game_gateway.reported_scores) == 1
    reported = game_gateway.reported_scores[0]
    assert reported.user_id == USER["id"]
    assert reported.score == 321
    assert reported.chat_id == -100123
    assert reported.message_id == 77

    with Session(engine) as db:
        player = db.get(Player, USER["id"])
        assert player is not None
        assert player.best_score == 321
        assert player.runs == 1
        run = db.exec(select(ScoreRun)).one()
        assert run.via is ScoreVia.GAME_MESSAGE
        assert run.session_nonce is not None


def test_score_without_auth_rejected(client) -> None:
    response = client.post(
        "/api/score", json={"session": None, "init_data": None, "score": 10}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "NCA_AUTH_REQUIRED"


def test_score_with_tampered_session_rejected(client) -> None:
    response = client.post(
        "/api/score",
        json={"session": "v1.forged.sig", "init_data": None, "score": 10},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "NCA_SESSION_INVALID"


def test_score_via_init_data_goes_to_global_only(client, engine, game_gateway) -> None:
    init_data = signed_init_data(
        token="123:cowskate-test-token", auth_date=NOW, user=USER
    )
    response = client.post(
        "/api/score",
        json={"session": None, "init_data": init_data, "score": 111},
    )
    assert response.status_code == 200
    assert game_gateway.reported_scores == []
    with Session(engine) as db:
        player = db.get(Player, USER["id"])
        assert player is not None
        assert player.first_name == "Му"
        run = db.exec(select(ScoreRun)).one()
        assert run.via is ScoreVia.MINI_APP
        assert run.session_nonce is None


def test_score_init_data_user_mismatch_rejected(client, settings) -> None:
    token = issue_token(settings)  # владелец сессии — USER.id
    other = dict(USER, id=9999)
    init_data = signed_init_data(
        token="123:cowskate-test-token", auth_date=NOW, user=other
    )
    response = client.post(
        "/api/score",
        json={"session": token, "init_data": init_data, "score": 10},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "NCA_IDENTITY_MISMATCH"


def test_score_expired_session_rejected(client, settings) -> None:
    token = issue_token(settings, ttl_seconds=10)
    stale_now = NOW + timedelta(hours=1)
    client.app.state.services.now = lambda: stale_now
    response = client.post(
        "/api/score",
        json={"session": token, "init_data": None, "score": 10},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "NCA_SESSION_EXPIRED"


def test_score_not_new_best_skips_native_report(client, game_gateway, settings) -> None:
    token = issue_token(settings)
    client.post("/api/score", json={"session": token, "init_data": None, "score": 500})
    game_gateway.reported_scores.clear()
    response = client.post(
        "/api/score", json={"session": token, "init_data": None, "score": 200}
    )
    assert response.status_code == 200
    assert response.json()["is_new_best"] is False
    assert response.json()["best"] == 500
    # setGameScore сам отказывает на понижение — не дёргаем API зря.
    assert game_gateway.reported_scores == []


def test_score_above_cap_rejected(client, settings) -> None:
    token = issue_token(settings)
    response = client.post(
        "/api/score",
        json={"session": token, "init_data": None, "score": 10**9},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "NCA_SCORE_OUT_OF_RANGE"


def test_leaderboard_orders_and_limits(client, engine) -> None:
    with Session(engine) as db:
        for index, score in enumerate([900, 300, 600], start=1):
            db.add(
                Player(
                    telegram_user_id=index,
                    first_name=f"Игрок {index}",
                    best_score=score,
                    runs=index,
                    created_at=NOW,
                    updated_at=NOW,
                )
            )
        db.commit()
    response = client.get("/api/leaderboard")
    assert response.status_code == 200
    entries = response.json()["entries"]
    assert [e["user_id"] for e in entries] == [1, 3, 2]
    assert entries[0]["position"] == 1
    assert entries[0]["score"] == 900

    limited = client.get("/api/leaderboard?limit=2").json()["entries"]
    assert len(limited) == 2


def test_score_stores_run_stats(client, engine, settings) -> None:
    # Фаза 0: один заезд — один POST с метриками заезда.
    token = issue_token(settings)
    response = client.post(
        "/api/score",
        json={
            "session": token,
            "init_data": None,
            "score": 321,
            "distance_m": 812,
            "duration_s": 47,
            "crash_reason": "hit",
            "max_mult": 3,
        },
    )
    assert response.status_code == 200
    with Session(engine) as db:
        player = db.get(Player, USER["id"])
        assert player is not None
        assert player.runs == 1
        run = db.exec(select(ScoreRun)).one()
        assert run.distance_m == 812
        assert run.duration_s == 47
        assert run.crash_reason == "hit"
        assert run.max_mult == 3


def test_score_old_body_without_run_stats_accepted(client, settings) -> None:
    # Старый клиент шлёт только score — статистика остаётся пустой.
    token = issue_token(settings)
    response = client.post(
        "/api/score", json={"session": token, "init_data": None, "score": 42}
    )
    assert response.status_code == 200


def test_score_implausible_for_duration_rejected(client, settings) -> None:
    token = issue_token(settings)
    response = client.post(
        "/api/score",
        json={
            "session": token,
            "init_data": None,
            "score": 100_000,
            "duration_s": 10,  # 10 000 очк/с — выше потолка профиля (5000)
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "NCA_SCORE_IMPLAUSIBLE"


def test_score_plausible_for_duration_accepted(client, settings) -> None:
    token = issue_token(settings)
    response = client.post(
        "/api/score",
        json={
            "session": token,
            "init_data": None,
            "score": 4000,
            "duration_s": 10,
        },
    )
    assert response.status_code == 200


def test_score_reports_prev_rank(client, engine, settings) -> None:
    # Фаза 0: карточке результата нужно «было #N» — позиция до сабмита.
    with Session(engine) as db:
        db.add(
            Player(
                telegram_user_id=1,
                first_name="Соперник",
                best_score=400,
                runs=3,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        db.commit()
    token = issue_token(settings)
    first = client.post(
        "/api/score", json={"session": token, "init_data": None, "score": 100}
    ).json()
    assert first["rank"] == 2
    assert first["prev_rank"] is None
    second = client.post(
        "/api/score", json={"session": token, "init_data": None, "score": 500}
    ).json()
    assert second["rank"] == 1
    assert second["prev_rank"] == 2
    third = client.post(
        "/api/score", json={"session": token, "init_data": None, "score": 50}
    ).json()
    assert third["rank"] == 1
    assert third["prev_rank"] == 1


def test_rank_reflects_position(client, engine) -> None:
    with Session(engine) as db:
        for user_id, score in [(1, 100), (2, 200)]:
            db.add(
                Player(
                    telegram_user_id=user_id,
                    first_name=f"Игрок {user_id}",
                    best_score=score,
                    created_at=NOW,
                    updated_at=NOW,
                )
            )
        db.commit()
    init_data = signed_init_data(
        token="123:cowskate-test-token", auth_date=NOW, user=USER
    )
    response = client.post(
        "/api/score",
        json={"session": None, "init_data": init_data, "score": 150},
    )
    assert response.json()["rank"] == 2
