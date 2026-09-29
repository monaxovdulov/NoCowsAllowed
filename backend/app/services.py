from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from aiogram import Bot, Dispatcher
from sqlalchemy.engine import Engine

from app.config import Settings
from app.modules.telegram import GameGateway


@dataclass(slots=True)
class AppServices:
    settings: Settings
    engine: Engine
    game_gateway: GameGateway
    # Общий Bot: им пользуется game gateway и dispatcher при разборе
    # webhook update.
    telegram_bot: Bot
    bot_dispatcher: Dispatcher
    now: Callable[[], datetime]
