from collections.abc import Iterator

from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

from app.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    return create_engine(str(settings.database_url), pool_pre_ping=True)


def session_from_engine(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
