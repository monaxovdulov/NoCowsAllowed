import logging

from aiogram.types import CallbackQuery, Message
from sqlmodel import Session

from app.modules.scores import PlayerIdentity, register_session, upsert_player
from app.modules.sessions import issue_session_token
from app.services import AppServices

logger = logging.getLogger(__name__)

_GREETING_PRIVATE = (
    "🐮🛹 Это Cow Skate — корова на скейте против гравитации.\n\n"
    "Жми «Играть», набирай очки за трюки и залетай в топ. "
    "В группе позови друзей командой /game — карточка сама покажет "
    "рекорды всех, кто играл в этом чате."
)
_GAME_BUTTON_UNSUPPORTED = (
    "Не удалось открыть игру — попробуйте ещё раз или обновите Telegram."
)


async def on_message(message: Message, services: AppServices) -> None:
    """/start в ЛС — приветствие + карточка игры; /game — карточка в чат,
    где её вызвали (в т.ч. группа: /game@bot долетает при privacy mode)."""
    if message.from_user is None or message.text is None:
        return
    command = message.text.split()[0].split("@", 1)[0]
    if command not in ("/start", "/game"):
        return
    if command == "/start" and message.chat.type == "private":
        await services.game_gateway.send_message(message.chat.id, _GREETING_PRIVATE)
    await services.game_gateway.send_game(message.chat.id)


async def on_game_callback_query(query: CallbackQuery, services: AppServices) -> None:
    """Play-кнопка карточки: выдаём подписанный URL сессии с контекстом
    игрового сообщения — по нему счёт попадёт в лидерборд этого чата."""
    if query.game_short_name != services.settings.telegram_game_short_name:
        await services.game_gateway.answer_callback_text(
            query.id, _GAME_BUTTON_UNSUPPORTED
        )
        return

    now = services.now()
    chat_id = message_id = None
    inline_message_id = None
    message = query.message
    if message is not None and hasattr(message, "chat"):
        chat_id = message.chat.id
        message_id = message.message_id
    else:
        inline_message_id = query.inline_message_id

    token, claims = issue_session_token(
        services.settings.game_session_secret,
        telegram_user_id=query.from_user.id,
        chat_id=chat_id,
        message_id=message_id,
        inline_message_id=inline_message_id,
        now=now,
        ttl_seconds=int(services.settings.profile.session_ttl.total_seconds()),
    )
    with Session(services.engine) as session:
        upsert_player(
            session,
            PlayerIdentity(
                telegram_user_id=query.from_user.id,
                first_name=query.from_user.first_name,
                last_name=query.from_user.last_name,
                username=query.from_user.username,
            ),
            now,
        )
        register_session(session, claims, now)
        session.commit()

    url = f"{services.settings.game_public_url}/?s={token}"
    await services.game_gateway.answer_game_url(query.id, url)
