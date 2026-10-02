from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from re import fullmatch
from typing import Annotated
from urllib.parse import quote, urlparse

from pydantic import Field, PostgresDsn, SecretStr, StringConstraints, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FastAPIEnvironment(StrEnum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


@dataclass(frozen=True, slots=True)
class AppProfile:
    session_ttl: timedelta
    leaderboard_limit: int
    leaderboard_max_limit: int
    # Правдоподобная верхняя граница счёта: не античит-гарантия, а отсечка
    # явно сломанных/подделанных значений.
    score_max: int
    # Мягкий анти-чит: верхняя граница очков в секунду заезда
    # (score <= duration_s * score_per_sec_max). Пристрелочная — после
    # фазы 1 (комбо) потолок пересматривается по данным ScoreRun.
    score_per_sec_max: int
    telegram_request_timeout: float


COWSKATE_V0_1_PROFILE = AppProfile(
    session_ttl=timedelta(hours=24),
    leaderboard_limit=50,
    leaderboard_max_limit=200,
    score_max=100_000_000,
    score_per_sec_max=400,
    telegram_request_timeout=30.0,
)

DEVELOPMENT_BOT_USERNAME = "cowskate_dev_bot"
DEVELOPMENT_GAME_SHORT_NAME = "cowskate_dev"
DEVELOPMENT_PUBLIC_URL = "http://localhost:8000"
DEVELOPMENT_WEBHOOK_SECRET = "cowskate-dev-webhook-secret"
DEVELOPMENT_SESSION_SECRET = "cowskate-dev-session-secret"
NonEmptyString = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1),
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    FASTAPI_ENV: FastAPIEnvironment
    DATABASE_HOST: NonEmptyString
    DATABASE_NAME: NonEmptyString
    DATABASE_PASSWORD: SecretStr = Field(min_length=1)
    DATABASE_PORT: int = Field(ge=1, le=65535)
    DATABASE_USER: NonEmptyString
    TELEGRAM_BOT_TOKEN: SecretStr | None = Field(default=None, min_length=1)
    TELEGRAM_BOT_USERNAME: str | None = None
    TELEGRAM_GAME_SHORT_NAME: str | None = None
    GAME_PUBLIC_URL: str | None = None
    # Секрет заголовка X-Telegram-Bot-Api-Secret-Token для /telegram/webhook.
    TELEGRAM_WEBHOOK_SECRET: SecretStr | None = Field(default=None, min_length=1)
    # Секрет HMAC-подписи игровых сессий в URL (?s=...).
    GAME_SESSION_SECRET: SecretStr | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_profile_bindings(self) -> Settings:
        if self.FASTAPI_ENV is FastAPIEnvironment.DEVELOPMENT:
            return self

        required = {
            "TELEGRAM_BOT_TOKEN": self.TELEGRAM_BOT_TOKEN,
            "TELEGRAM_BOT_USERNAME": self.TELEGRAM_BOT_USERNAME,
            "TELEGRAM_GAME_SHORT_NAME": self.TELEGRAM_GAME_SHORT_NAME,
            "GAME_PUBLIC_URL": self.GAME_PUBLIC_URL,
            "TELEGRAM_WEBHOOK_SECRET": self.TELEGRAM_WEBHOOK_SECRET,
            "GAME_SESSION_SECRET": self.GAME_SESSION_SECRET,
        }
        missing = [name for name, value in required.items() if value is None]
        if missing:
            joined = ", ".join(missing)
            raise ValueError(
                f"NCA_CONFIG_REQUIRED: production bindings are missing: {joined}"
            )

        self._validate_telegram_bindings()
        return self

    def _validate_telegram_bindings(self) -> None:
        for name, value in (
            ("TELEGRAM_BOT_USERNAME", self.TELEGRAM_BOT_USERNAME),
            ("TELEGRAM_GAME_SHORT_NAME", self.TELEGRAM_GAME_SHORT_NAME),
        ):
            self._validate_handle(name, value)
        self._validate_webhook_secret()
        self._validate_public_url()

    def _validate_webhook_secret(self) -> None:
        secret = (
            None
            if self.TELEGRAM_WEBHOOK_SECRET is None
            else self.TELEGRAM_WEBHOOK_SECRET.get_secret_value()
        )
        if secret is None:
            raise AssertionError("validated production webhook secret is missing")
        # Формат по Bot API setWebhook: 1–256 символов A-Z a-z 0-9 _ -;
        # минимум 16 — энтропия против подбора.
        if fullmatch(r"[A-Za-z0-9_\-]{16,256}", secret) is None:
            raise ValueError(
                "NCA_CONFIG_INVALID: TELEGRAM_WEBHOOK_SECRET must be "
                "16-256 characters of A-Z a-z 0-9 _ -"
            )

    def _validate_public_url(self) -> None:
        parsed = urlparse(self.GAME_PUBLIC_URL or "")
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.path not in ("", "/")
        ):
            raise ValueError(
                "NCA_CONFIG_INVALID: GAME_PUBLIC_URL must be https://<host> "
                "without path"
            )

    @staticmethod
    def _validate_handle(name: str, value: str | None) -> None:
        if value is None or fullmatch(r"[A-Za-z0-9_]{1,64}", value) is None:
            raise ValueError(
                f"NCA_CONFIG_INVALID: {name} contains unsupported characters"
            )

    @property
    def is_development(self) -> bool:
        return self.FASTAPI_ENV is FastAPIEnvironment.DEVELOPMENT

    @property
    def profile(self) -> AppProfile:
        return COWSKATE_V0_1_PROFILE

    @property
    def telegram_bot_token(self) -> str | None:
        if self.TELEGRAM_BOT_TOKEN is None:
            return None
        return self.TELEGRAM_BOT_TOKEN.get_secret_value()

    @property
    def telegram_bot_username(self) -> str:
        if self.is_development:
            return DEVELOPMENT_BOT_USERNAME
        if self.TELEGRAM_BOT_USERNAME is None:
            raise RuntimeError("validated Telegram bot username is missing")
        return self.TELEGRAM_BOT_USERNAME

    @property
    def telegram_game_short_name(self) -> str:
        if self.is_development:
            return DEVELOPMENT_GAME_SHORT_NAME
        if self.TELEGRAM_GAME_SHORT_NAME is None:
            raise RuntimeError("validated Telegram game short name is missing")
        return self.TELEGRAM_GAME_SHORT_NAME

    @property
    def game_public_url(self) -> str:
        if self.is_development:
            return DEVELOPMENT_PUBLIC_URL
        if self.GAME_PUBLIC_URL is None:
            raise RuntimeError("validated game public URL is missing")
        return self.GAME_PUBLIC_URL.rstrip("/")

    @property
    def telegram_webhook_secret(self) -> str:
        if self.is_development:
            return DEVELOPMENT_WEBHOOK_SECRET
        if self.TELEGRAM_WEBHOOK_SECRET is None:
            raise RuntimeError("validated Telegram webhook secret is missing")
        return self.TELEGRAM_WEBHOOK_SECRET.get_secret_value()

    @property
    def game_session_secret(self) -> bytes:
        if self.is_development:
            return DEVELOPMENT_SESSION_SECRET.encode()
        if self.GAME_SESSION_SECRET is None:
            raise RuntimeError("validated game session secret is missing")
        return self.GAME_SESSION_SECRET.get_secret_value().encode()

    @property
    def webhook_url(self) -> str:
        return f"{self.game_public_url}/telegram/webhook"

    @property
    def database_url(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=quote(self.DATABASE_USER, safe=""),
            password=quote(self.DATABASE_PASSWORD.get_secret_value(), safe=""),
            host=self.DATABASE_HOST,
            port=self.DATABASE_PORT,
            path=quote(self.DATABASE_NAME, safe=""),
        )
