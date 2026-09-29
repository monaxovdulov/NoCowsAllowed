import os
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

os.environ.setdefault("FASTAPI_ENV", "development")
os.environ.setdefault("DATABASE_HOST", "127.0.0.1")
os.environ.setdefault("DATABASE_NAME", "cowskate_test")
os.environ.setdefault("DATABASE_PASSWORD", "cowskate-test-password")
os.environ.setdefault("DATABASE_PORT", "55432")
os.environ.setdefault("DATABASE_USER", "cowskate_test")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123:cowskate-test-token")

# Импорты ниже os.environ: Settings() читает эти значения. `app.models`
# нужен для регистрации метаданных; E402/F401 выключены для файла
# в per-file-ignores backend/pyproject.toml.
from app import models
from app.config import Settings
from app.main import create_app
from app.modules.telegram import InMemoryGameGateway

TEST_BOT_TOKEN = "123:cowskate-test-token"
TEST_NOW = datetime(2026, 9, 29, 12, 0, 0, tzinfo=UTC)


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None)


@pytest.fixture
def engine(settings: Settings) -> Iterator[Engine]:
    del settings
    database_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(database_engine)
    yield database_engine
    SQLModel.metadata.drop_all(database_engine)
    database_engine.dispose()


@pytest.fixture
def game_gateway() -> InMemoryGameGateway:
    return InMemoryGameGateway()


@pytest.fixture
def now() -> datetime:
    return TEST_NOW


@pytest.fixture
def client(settings: Settings, engine: Engine, game_gateway: InMemoryGameGateway):
    from fastapi.testclient import TestClient

    application = create_app(
        settings=settings,
        engine=engine,
        game_gateway=game_gateway,
        now=lambda: TEST_NOW,
    )
    with TestClient(application) as test_client:
        yield test_client
