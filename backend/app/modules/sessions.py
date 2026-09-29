import hashlib
import hmac
import json
import secrets
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from datetime import UTC, datetime

from app.errors import AppError

# Формат токена: "v1.<b64url json>.<b64url hmac>". Токен несёт контекст
# игрового сообщения (chat_id+message_id либо inline_message_id), без него
# setGameScore вызвать нельзя — поэтому сессия выдаётся на каждый Play.
TOKEN_VERSION = "v1"


@dataclass(frozen=True, slots=True)
class SessionClaims:
    nonce: str
    telegram_user_id: int
    chat_id: int | None
    message_id: int | None
    inline_message_id: str | None
    expires_at: datetime


def _b64e(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(data: str) -> bytes:
    return urlsafe_b64decode(data + "=" * (-len(data) % 4))


def issue_session_token(
    secret: bytes,
    *,
    telegram_user_id: int,
    chat_id: int | None,
    message_id: int | None,
    inline_message_id: str | None,
    now: datetime,
    ttl_seconds: int,
) -> tuple[str, SessionClaims]:
    nonce = secrets.token_hex(16)
    expires_at = datetime.fromtimestamp(now.timestamp() + ttl_seconds, UTC)
    payload = {
        "u": telegram_user_id,
        "c": chat_id,
        "m": message_id,
        "i": inline_message_id,
        "n": nonce,
        "e": int(expires_at.timestamp()),
    }
    payload_b64 = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{TOKEN_VERSION}.{payload_b64}"
    signature = _b64e(hmac.new(secret, signing_input.encode(), hashlib.sha256).digest())
    token = f"{signing_input}.{signature}"
    claims = SessionClaims(
        nonce=nonce,
        telegram_user_id=telegram_user_id,
        chat_id=chat_id,
        message_id=message_id,
        inline_message_id=inline_message_id,
        expires_at=expires_at,
    )
    return token, claims


def verify_session_token(secret: bytes, token: str, now: datetime) -> SessionClaims:
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != TOKEN_VERSION:
        raise _session_invalid()
    signing_input = f"{parts[0]}.{parts[1]}"
    expected = _b64e(hmac.new(secret, signing_input.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, parts[2]):
        raise _session_invalid()
    try:
        payload = json.loads(_b64d(parts[1]))
        claims = SessionClaims(
            nonce=str(payload["n"]),
            telegram_user_id=int(payload["u"]),
            chat_id=payload.get("c"),
            message_id=payload.get("m"),
            inline_message_id=payload.get("i"),
            expires_at=datetime.fromtimestamp(int(payload["e"]), UTC),
        )
    except ValueError, KeyError, TypeError, json.JSONDecodeError:
        raise _session_invalid() from None
    if now.timestamp() >= claims.expires_at.timestamp():
        raise AppError(
            status_code=401,
            code="NCA_SESSION_EXPIRED",
            message="Игровая сессия истекла — откройте игру заново из чата.",
        )
    return claims


def _session_invalid() -> AppError:
    return AppError(
        status_code=401,
        code="NCA_SESSION_INVALID",
        message="Игровая сессия недействительна — откройте игру из чата.",
    )
