from aiogram import Dispatcher, F

from app.bot.handlers import on_game_callback_query, on_message


def build_dispatcher() -> Dispatcher:
    dispatcher = Dispatcher()
    # Разбор команд внутри хэндлера: фильтр Command() резолвит @mention
    # через bot.me() — сетевой вызов, несовместимый с inert-bot в dev/test.
    dispatcher.message.register(on_message, F.text.startswith("/"))
    # Только игровые callback (game_short_name); data-callback'ов у бота нет.
    dispatcher.callback_query.register(on_game_callback_query, F.game_short_name)
    return dispatcher
