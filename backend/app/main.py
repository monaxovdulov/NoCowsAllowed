import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from warnings import warn

from aiogram import Bot
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import Engine
from starlette.types import Scope

from app.api.router import api_router
from app.api.telegram_webhook import router as telegram_webhook_router
from app.bot import build_dispatcher
from app.config import Settings
from app.db import create_database_engine
from app.errors import (
    AppError,
    app_error_handler,
    request_validation_error_handler,
    unexpected_error_handler,
)
from app.modules.telegram import (
    AiogramGameGateway,
    GameGateway,
    InMemoryGameGateway,
)
from app.services import AppServices

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"
BACKEND_METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
# Dispatcher в dev работает с inert Bot: токен нужен только для
# Bot.id в логах aiogram, API-вызовы делает InMemoryGameGateway.
DEVELOPMENT_BOT_TOKEN = "1:cowskate-development"


def create_app(
    static_dir: Path = STATIC_DIR,
    *,
    settings: Settings | None = None,
    engine: Engine | None = None,
    game_gateway: GameGateway | None = None,
    now: Callable[[], datetime] | None = None,
    register_webhook: bool = True,
) -> FastAPI:
    resolved_settings = settings or Settings()
    resolved_engine = engine or create_database_engine(resolved_settings)
    telegram_bot = _resolve_telegram_bot(resolved_settings)
    game_gateway = _resolve_game_gateway(resolved_settings, game_gateway, telegram_bot)

    services = AppServices(
        settings=resolved_settings,
        engine=resolved_engine,
        game_gateway=game_gateway,
        telegram_bot=telegram_bot,
        bot_dispatcher=build_dispatcher(),
        now=now or (lambda: datetime.now(UTC)),
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if register_webhook and not resolved_settings.is_development:
            try:
                await services.game_gateway.register_webhook(
                    services.settings.webhook_url,
                    services.settings.telegram_webhook_secret,
                )
            except Exception:
                # Приложение всё равно поднимается: webhook можно
                # перерегистрировать отдельно, игра обслуживается.
                logger.exception("NCA_WEBHOOK_REGISTER_FAILED")
        try:
            yield
        finally:
            await telegram_bot.session.close()

    application = FastAPI(
        title="NoCowsAllowed — Cow Skate",
        docs_url="/docs" if resolved_settings.is_development else None,
        openapi_url=("/openapi.json" if resolved_settings.is_development else None),
        lifespan=lifespan,
    )
    application.state.services = services
    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(
        RequestValidationError, request_validation_error_handler
    )
    application.add_exception_handler(Exception, unexpected_error_handler)

    @application.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(api_router)
    application.include_router(telegram_webhook_router)

    @application.api_route(
        "/api/{path:path}", methods=BACKEND_METHODS, include_in_schema=False
    )
    @application.api_route(
        "/telegram/{path:path}", methods=BACKEND_METHODS, include_in_schema=False
    )
    def backend_route_not_found() -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={
                "code": "NCA_ROUTE_NOT_FOUND",
                "message": "Запрошенный API-маршрут не найден.",
            },
        )

    if not static_dir.is_dir():
        warn(f"Static game directory does not exist: {static_dir}", stacklevel=2)
    # Монтирование последним: /api и /telegram обслуживаются роутерами выше.
    application.mount(
        "/", NoCacheStaticFiles(directory=static_dir, html=True), name="game"
    )
    return application


class NoCacheStaticFiles(StaticFiles):
    # D8: Telegram webview агрессивно кэширует модули — свежий index.html
    # поверх устаревшего game/*.js ломал импорты. no-cache заставляет
    # ревалидировать по ETag (Starlette сам отдаёт 304), трафик тот же.
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers.setdefault("Cache-Control", "no-cache")
        return response


def _resolve_telegram_bot(settings: Settings) -> Bot:
    """Единый Bot процесса: его session закрывается в lifespan create_app."""
    if settings.is_development:
        return Bot(DEVELOPMENT_BOT_TOKEN)
    token = settings.telegram_bot_token
    if token is None:
        raise AssertionError("validated production Telegram token is missing")
    return Bot(token)


def _resolve_game_gateway(
    settings: Settings, injected: GameGateway | None, telegram_bot: Bot
) -> GameGateway:
    if injected is not None:
        return injected
    if settings.is_development:
        return InMemoryGameGateway()
    return AiogramGameGateway(
        telegram_bot,
        settings.telegram_game_short_name,
        settings.game_public_url,
        settings.profile.telegram_request_timeout,
    )


app = create_app()
