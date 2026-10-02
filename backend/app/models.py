from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger
from sqlmodel import Field, SQLModel


class ScoreVia(StrEnum):
    # game_message — счёт из сессии игрового сообщения (есть привязка для
    # setGameScore); mini_app — запуск как Mini App без игрового сообщения.
    GAME_MESSAGE = "game_message"
    MINI_APP = "mini_app"


class Player(SQLModel, table=True):
    # Telegram id давно за пределами int32 — BigInteger, как в миграции.
    telegram_user_id: int = Field(primary_key=True, sa_type=BigInteger)
    first_name: str
    last_name: str | None = None
    username: str | None = None
    best_score: int = 0
    runs: int = 0
    created_at: datetime
    updated_at: datetime


class GameSession(SQLModel, table=True):
    # nonce — случайная часть подписанного токена ?s=; по ней сессия
    # находится в БД и привязывается к отправленным счетам.
    nonce: str = Field(primary_key=True)
    telegram_user_id: int = Field(
        foreign_key="player.telegram_user_id", index=True, sa_type=BigInteger
    )
    chat_id: int | None = Field(default=None, sa_type=BigInteger)
    message_id: int | None = None
    inline_message_id: str | None = None
    issued_at: datetime
    expires_at: datetime


class ScoreRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    telegram_user_id: int = Field(
        foreign_key="player.telegram_user_id", index=True, sa_type=BigInteger
    )
    session_nonce: str | None = Field(default=None, index=True)
    score: int
    via: ScoreVia
    created_at: datetime = Field(index=True)
    # Статистика заезда (продукт-план, фаза 0): один ряд = один заезд.
    # Nullable — старые клиенты этих полей не присылают.
    distance_m: int | None = None
    duration_s: int | None = None
    crash_reason: str | None = None
    max_mult: int | None = None
