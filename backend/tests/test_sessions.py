from datetime import UTC, datetime, timedelta

import pytest

from app.errors import AppError
from app.modules.sessions import issue_session_token, verify_session_token

SECRET = b"test-session-secret"
NOW = datetime(2026, 9, 29, 12, 0, 0, tzinfo=UTC)


def issue(**overrides):
    kwargs = {
        "telegram_user_id": 42,
        "chat_id": -100123,
        "message_id": 77,
        "inline_message_id": None,
        "now": NOW,
        "ttl_seconds": 3600,
    }
    kwargs.update(overrides)
    return issue_session_token(SECRET, **kwargs)


def test_session_token_roundtrip() -> None:
    token, claims = issue()
    parsed = verify_session_token(SECRET, token, NOW)
    assert parsed.telegram_user_id == 42
    assert parsed.chat_id == -100123
    assert parsed.message_id == 77
    assert parsed.inline_message_id is None
    assert parsed.nonce == claims.nonce


def test_session_token_tampered_payload_rejected() -> None:
    token, _ = issue()
    parts = token.split(".")
    parts[1] = parts[1][:-2] + ("AA" if not parts[1].endswith("AA") else "BB")
    with pytest.raises(AppError) as error:
        verify_session_token(SECRET, ".".join(parts), NOW)
    assert error.value.code == "NCA_SESSION_INVALID"


def test_session_token_wrong_secret_rejected() -> None:
    token, _ = issue()
    with pytest.raises(AppError) as error:
        verify_session_token(b"another-secret", token, NOW)
    assert error.value.code == "NCA_SESSION_INVALID"


def test_session_token_expired_rejected() -> None:
    token, _ = issue(ttl_seconds=60)
    later = NOW + timedelta(seconds=120)
    with pytest.raises(AppError) as error:
        verify_session_token(SECRET, token, later)
    assert error.value.code == "NCA_SESSION_EXPIRED"


@pytest.mark.parametrize("token", ["", "a.b", "v2.x.y", "v1.not-json.sig"])
def test_session_token_malformed_rejected(token: str) -> None:
    with pytest.raises(AppError) as error:
        verify_session_token(SECRET, token, NOW)
    assert error.value.code == "NCA_SESSION_INVALID"
