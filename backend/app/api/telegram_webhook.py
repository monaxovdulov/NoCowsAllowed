import json
import logging
from hmac import compare_digest

from aiogram.types import Update
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

# Минимальный allowlist: команды (/start, /game), игровые callback-кнопки
# и inline_query — шаринг карточки игры в любой чат через @cawSkatebot.
ALLOWED_UPDATE_TYPES = frozenset({"message", "callback_query", "inline_query"})
MAX_UPDATE_BODY_BYTES = 64 * 1024
WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token"

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(request: Request) -> JSONResponse:
    """Доверенный webhook Telegram: проверка секрета до любого разбора,
    безопасный лимит тела, allowlist update types, typed Update."""
    services = request.app.state.services
    provided = request.headers.get(WEBHOOK_SECRET_HEADER, "")
    expected = services.settings.telegram_webhook_secret
    if not compare_digest(provided.encode(), expected.encode()):
        logger.warning("NCA_WEBHOOK_SECRET_REJECTED")
        return JSONResponse(
            status_code=401,
            content={
                "code": "NCA_WEBHOOK_UNAUTHORIZED",
                "message": "Webhook request rejected.",
            },
        )

    body = await _read_capped(request)
    if body is None:
        return JSONResponse(
            status_code=413,
            content={
                "code": "NCA_WEBHOOK_TOO_LARGE",
                "message": "Webhook payload rejected.",
            },
        )
    try:
        payload = json.loads(body)
    except TypeError, ValueError:
        payload = None
    if not isinstance(payload, dict) or not isinstance(payload.get("update_id"), int):
        logger.warning("NCA_WEBHOOK_MALFORMED")
        return JSONResponse(
            status_code=400,
            content={
                "code": "NCA_WEBHOOK_MALFORMED",
                "message": "Webhook payload rejected.",
            },
        )

    update_fields = set(payload) - {"update_id"}
    if update_fields.isdisjoint(ALLOWED_UPDATE_TYPES):
        return JSONResponse(content={"status": "ignored"})

    try:
        update = Update.model_validate(payload, context={"bot": services.telegram_bot})
    except ValidationError:
        logger.warning(
            "NCA_WEBHOOK_UPDATE_INVALID update_id=%s",
            payload.get("update_id"),
        )
        return JSONResponse(
            status_code=400,
            content={
                "code": "NCA_WEBHOOK_MALFORMED",
                "message": "Webhook payload rejected.",
            },
        )

    try:
        await services.bot_dispatcher.feed_update(
            services.telegram_bot, update, services=services
        )
    except Exception:
        # Не отдаём 500: Telegram иначе переотправляет update бесконечно.
        logger.exception(
            "NCA_WEBHOOK_UPDATE_FAILED update_id=%s",
            payload.get("update_id"),
        )
    return JSONResponse(content={"status": "ok"})


async def _read_capped(request: Request) -> bytes | None:
    """Тело ограничено MAX_UPDATE_BODY_BYTES; oversize → None (413)."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_UPDATE_BODY_BYTES:
                return None
        except ValueError:
            return None
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > MAX_UPDATE_BODY_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)
