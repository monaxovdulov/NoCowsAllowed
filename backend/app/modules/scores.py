from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlmodel import Session, select

from app.errors import AppError
from app.models import GameSession, Player, ScoreRun, ScoreVia
from app.modules.sessions import SessionClaims


@dataclass(frozen=True, slots=True)
class PlayerIdentity:
    # Имена опциональны: сессия без initData несёт только user_id, а имя
    # уже записано апсертом на момент выдачи сессии (callback от Telegram
    # содержит полный профиль). Не затираем реальные имена заглушками.
    telegram_user_id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None


@dataclass(frozen=True, slots=True)
class LeaderboardEntry:
    position: int
    telegram_user_id: int
    first_name: str
    username: str | None
    best_score: int
    runs: int


@dataclass(frozen=True, slots=True)
class RecordedScore:
    player: Player
    is_new_best: bool
    rank: int


def upsert_player(session: Session, identity: PlayerIdentity, now: datetime) -> Player:
    player = session.get(Player, identity.telegram_user_id)
    if player is None:
        player = Player(
            telegram_user_id=identity.telegram_user_id,
            first_name=identity.first_name or "Игрок",
            last_name=identity.last_name,
            username=identity.username,
            created_at=now,
            updated_at=now,
        )
        session.add(player)
        # UOW не сортирует вставки по «голому» FK (только по Relationship):
        # без flush строки gamesession/scorerun могут уйти раньше player
        # и словить FK violation на Postgres.
        session.flush()
        return player
    if identity.first_name is not None:
        player.first_name = identity.first_name
        player.last_name = identity.last_name
        player.username = identity.username
    player.updated_at = now
    session.flush()
    return player


def register_session(session: Session, claims: SessionClaims, now: datetime) -> None:
    session.add(
        GameSession(
            nonce=claims.nonce,
            telegram_user_id=claims.telegram_user_id,
            chat_id=claims.chat_id,
            message_id=claims.message_id,
            inline_message_id=claims.inline_message_id,
            issued_at=now,
            expires_at=claims.expires_at,
        )
    )


def record_score(
    session: Session,
    *,
    identity: PlayerIdentity,
    score: int,
    claims: SessionClaims | None,
    score_max: int,
    now: datetime,
) -> RecordedScore:
    if score < 0 or score > score_max:
        raise AppError(
            status_code=422,
            code="NCA_SCORE_OUT_OF_RANGE",
            message="Недопустимое значение счёта.",
        )
    player = upsert_player(session, identity, now)
    session.add(
        ScoreRun(
            telegram_user_id=player.telegram_user_id,
            session_nonce=None if claims is None else claims.nonce,
            score=score,
            via=(ScoreVia.MINI_APP if claims is None else ScoreVia.GAME_MESSAGE),
            created_at=now,
        )
    )
    player.runs += 1
    is_new_best = score > player.best_score
    if is_new_best:
        player.best_score = score
    player.updated_at = now
    session.flush()
    return RecordedScore(
        player=player,
        is_new_best=is_new_best,
        rank=player_rank(session, player),
    )


def leaderboard(session: Session, limit: int) -> list[LeaderboardEntry]:
    rows = session.exec(
        select(Player)
        .where(Player.best_score > 0)
        .order_by(Player.best_score.desc(), Player.telegram_user_id)
        .limit(limit)
    ).all()
    return [
        LeaderboardEntry(
            position=index + 1,
            telegram_user_id=row.telegram_user_id,
            first_name=row.first_name,
            username=row.username,
            best_score=row.best_score,
            runs=row.runs,
        )
        for index, row in enumerate(rows)
    ]


def player_rank(session: Session, player: Player) -> int:
    ahead = session.exec(
        select(func.count())
        .select_from(Player)
        .where(
            (Player.best_score > player.best_score)
            | (
                (Player.best_score == player.best_score)
                & (Player.telegram_user_id < player.telegram_user_id)
            )
        )
    ).one()
    return int(ahead) + 1
