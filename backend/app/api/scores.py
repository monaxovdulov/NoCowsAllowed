import logging
from datetime import datetime

from aiogram.utils.web_app import safe_parse_webapp_init_data
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.errors import AppError
from app.modules.scores import (
    PlayerIdentity,
    leaderboard,
    record_score,
)
from app.modules.sessions import SessionClaims, verify_session_token

logger = logging.getLogger(__name__)
router = APIRouter()


class ScoreSubmit(BaseModel):
    # Хотя бы один источник идентичности обязателен: подписанная сессия
    # игрового сообщения (url ?s=) либо Telegram initData (Mini App).
    session: str | None = Field(default=None, max_length=2048)
    init_data: str | None = Field(default=None, max_length=8192)
    score: int = Field(ge=0)


class ScoreAccepted(BaseModel):
    ok: bool
    best: int
    rank: int
    is_new_best: bool


class LeaderboardRow(BaseModel):
    position: int
    user_id: int
    first_name: str
    username: str | None
    score: int
    runs: int


class LeaderboardView(BaseModel):
    entries: list[LeaderboardRow]


@router.post("/score", response_model=ScoreAccepted)
async def submit_score(request: Request, body: ScoreSubmit) -> ScoreAccepted:
    """Приём счёта из игры: запись в свою БД (глобальный топ) + проброс
    в setGameScore (нативный лидерборд на карточке игры в чате)."""
    services = request.app.state.services
    settings = services.settings
    now = services.now()
    claims = _verify_session(settings, body.session, now)
    init_user = _verify_init_data(
        services, body.init_data, expected_user_id=_claims_user_id(claims)
    )
    if claims is None and init_user is None:
        raise AppError(
            status_code=401,
            code="NCA_AUTH_REQUIRED",
            message="Откройте игру из Telegram — не удалось подтвердить игрока.",
        )

    identity = _identity_from(claims, init_user)
    with Session(services.engine) as db:
        recorded = record_score(
            db,
            identity=identity,
            score=body.score,
            claims=claims,
            score_max=settings.profile.score_max,
            now=now,
        )
        db.commit()
        best = recorded.player.best_score

    if claims is not None and _has_message_context(claims) and recorded.is_new_best:
        await _report_native_score(services, claims, body.score)

    return ScoreAccepted(
        ok=True,
        best=best,
        rank=recorded.rank,
        is_new_best=recorded.is_new_best,
    )


@router.get("/leaderboard", response_model=LeaderboardView)
def get_leaderboard(request: Request, limit: int = 0) -> LeaderboardView:
    services = request.app.state.services
    profile = services.settings.profile
    effective = limit if limit > 0 else profile.leaderboard_limit
    effective = min(effective, profile.leaderboard_max_limit)
    with Session(services.engine) as db:
        entries = leaderboard(db, effective)
    return LeaderboardView(
        entries=[
            LeaderboardRow(
                position=entry.position,
                user_id=entry.telegram_user_id,
                first_name=entry.first_name,
                username=entry.username,
                score=entry.best_score,
                runs=entry.runs,
            )
            for entry in entries
        ]
    )


def _verify_session(settings, token: str | None, now: datetime) -> SessionClaims | None:
    if token is None:
        return None
    return verify_session_token(settings.game_session_secret, token, now)


def _claims_user_id(claims: SessionClaims | None) -> int | None:
    return None if claims is None else claims.telegram_user_id


def _verify_init_data(services, init_data: str | None, *, expected_user_id: int | None):
    """initData — опциональный второй фактор: при наличии подпись
    проверяется и user.id обязан совпасть с владельцем сессии."""
    if init_data is None:
        return None
    token = services.settings.telegram_bot_token
    if token is None:
        raise AppError(
            status_code=503,
            code="NCA_INIT_DATA_UNAVAILABLE",
            message="Проверка initData не настроена.",
        )
    try:
        parsed = safe_parse_webapp_init_data(token, init_data)
    except ValueError:
        raise AppError(
            status_code=401,
            code="NCA_INIT_DATA_INVALID",
            message="Данные Telegram не прошли проверку подписи.",
        ) from None
    if parsed.user is None:
        raise AppError(
            status_code=401,
            code="NCA_INIT_DATA_NO_USER",
            message="В данных Telegram нет пользователя.",
        )
    if expected_user_id is not None and parsed.user.id != expected_user_id:
        raise AppError(
            status_code=403,
            code="NCA_IDENTITY_MISMATCH",
            message="Пользователь Telegram не совпадает с владельцем сессии.",
        )
    return parsed.user


def _identity_from(claims: SessionClaims | None, init_user) -> PlayerIdentity:
    if init_user is not None:
        return PlayerIdentity(
            telegram_user_id=init_user.id,
            first_name=init_user.first_name,
            last_name=init_user.last_name,
            username=init_user.username,
        )
    assert claims is not None
    return PlayerIdentity(telegram_user_id=claims.telegram_user_id)


def _has_message_context(claims: SessionClaims) -> bool:
    return (claims.chat_id is not None and claims.message_id is not None) or (
        claims.inline_message_id is not None
    )


async def _report_native_score(services, claims: SessionClaims, score: int) -> None:
    """Отказ Bot API не должен ронять приём счёта: глобальный топ уже
    записан; нативный скорборд обновится при следующем сабмите."""
    try:
        await services.game_gateway.set_game_score(
            user_id=claims.telegram_user_id,
            score=score,
            chat_id=claims.chat_id,
            message_id=claims.message_id,
            inline_message_id=claims.inline_message_id,
        )
    except Exception:
        logger.warning(
            "NCA_SET_GAME_SCORE_FAILED user_id=%s chat_id=%s message_id=%s",
            claims.telegram_user_id,
            claims.chat_id,
            claims.message_id,
            exc_info=True,
        )
