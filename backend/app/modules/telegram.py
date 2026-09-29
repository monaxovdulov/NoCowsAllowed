import logging
from dataclasses import dataclass
from typing import Protocol

from aiogram import Bot
from aiogram.types import (
    CallbackGame,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultGame,
)

logger = logging.getLogger(__name__)


class GameGateway(Protocol):
    """Единственная точка обращения к Bot API из доменного кода."""

    async def send_message(self, chat_id: int, text: str) -> None: ...

    async def send_game(self, chat_id: int) -> None: ...

    async def answer_game_url(self, callback_query_id: str, url: str) -> None: ...

    async def answer_callback_text(self, callback_query_id: str, text: str) -> None: ...

    async def set_game_score(
        self,
        *,
        user_id: int,
        score: int,
        chat_id: int | None,
        message_id: int | None,
        inline_message_id: str | None,
    ) -> None: ...

    async def answer_inline_game(self, inline_query_id: str) -> None: ...

    async def register_webhook(self, url: str, secret_token: str) -> None: ...

    async def close(self) -> None: ...


class AiogramGameGateway:
    def __init__(
        self,
        bot: Bot,
        game_short_name: str,
        public_url: str,
        request_timeout: float,
    ) -> None:
        self._bot = bot
        self._game_short_name = game_short_name
        self._public_url = public_url
        self._request_timeout = request_timeout

    async def send_message(self, chat_id: int, text: str) -> None:
        await self._bot.send_message(
            chat_id=chat_id,
            text=text,
            request_timeout=int(self._request_timeout),
        )

    async def send_game(self, chat_id: int) -> None:
        await self._bot.send_game(
            chat_id=chat_id,
            game_short_name=self._game_short_name,
            reply_markup=_game_keyboard(self._public_url),
            request_timeout=int(self._request_timeout),
        )

    async def answer_game_url(self, callback_query_id: str, url: str) -> None:
        await self._bot.answer_callback_query(
            callback_query_id=callback_query_id,
            url=url,
            request_timeout=int(self._request_timeout),
        )

    async def answer_callback_text(self, callback_query_id: str, text: str) -> None:
        await self._bot.answer_callback_query(
            callback_query_id=callback_query_id,
            text=text,
            show_alert=True,
            request_timeout=int(self._request_timeout),
        )

    async def set_game_score(
        self,
        *,
        user_id: int,
        score: int,
        chat_id: int | None,
        message_id: int | None,
        inline_message_id: str | None,
    ) -> None:
        await self._bot.set_game_score(
            user_id=user_id,
            score=score,
            chat_id=chat_id,
            message_id=message_id,
            inline_message_id=inline_message_id,
            request_timeout=int(self._request_timeout),
        )

    async def answer_inline_game(self, inline_query_id: str) -> None:
        await self._bot.answer_inline_query(
            inline_query_id=inline_query_id,
            results=[
                InlineQueryResultGame(
                    id="play",
                    game_short_name=self._game_short_name,
                )
            ],
            cache_time=0,
            request_timeout=int(self._request_timeout),
        )

    async def register_webhook(self, url: str, secret_token: str) -> None:
        await self._bot.set_webhook(
            url=url,
            secret_token=secret_token,
            allowed_updates=["message", "callback_query", "inline_query"],
            request_timeout=int(self._request_timeout),
        )

    async def close(self) -> None:
        await self._bot.session.close()


@dataclass(frozen=True, slots=True)
class SentGame:
    chat_id: int


@dataclass(frozen=True, slots=True)
class AnsweredGameUrl:
    callback_query_id: str
    url: str


@dataclass(frozen=True, slots=True)
class ReportedScore:
    user_id: int
    score: int
    chat_id: int | None
    message_id: int | None
    inline_message_id: str | None


class InMemoryGameGateway:
    """Dev/test дублёр: вызовы Bot API видны в списках."""

    def __init__(self) -> None:
        self.sent_games: list[SentGame] = []
        self.answered_urls: list[AnsweredGameUrl] = []
        self.answered_texts: list[tuple[str, str]] = []
        self.reported_scores: list[ReportedScore] = []
        self.registered_webhooks: list[tuple[str, str]] = []
        self.fail_next_score: list[Exception] = []
        self.sent_messages: list[tuple[int, str]] = []
        self.answered_inline: list[str] = []

    async def send_message(self, chat_id: int, text: str) -> None:
        self.sent_messages.append((chat_id, text))

    async def send_game(self, chat_id: int) -> None:
        self.sent_games.append(SentGame(chat_id=chat_id))

    async def answer_game_url(self, callback_query_id: str, url: str) -> None:
        self.answered_urls.append(
            AnsweredGameUrl(callback_query_id=callback_query_id, url=url)
        )

    async def answer_callback_text(self, callback_query_id: str, text: str) -> None:
        self.answered_texts.append((callback_query_id, text))

    async def set_game_score(
        self,
        *,
        user_id: int,
        score: int,
        chat_id: int | None,
        message_id: int | None,
        inline_message_id: str | None,
    ) -> None:
        if self.fail_next_score:
            raise self.fail_next_score.pop(0)
        self.reported_scores.append(
            ReportedScore(
                user_id=user_id,
                score=score,
                chat_id=chat_id,
                message_id=message_id,
                inline_message_id=inline_message_id,
            )
        )

    async def answer_inline_game(self, inline_query_id: str) -> None:
        self.answered_inline.append(inline_query_id)

    async def register_webhook(self, url: str, secret_token: str) -> None:
        self.registered_webhooks.append((url, secret_token))

    async def close(self) -> None:
        return None


def _game_keyboard(public_url: str) -> InlineKeyboardMarkup:
    # Первая кнопка первого ряда обязана запускать игру (callback_game);
    # остальные — по вкусу. Вторая ведёт на публичный общий топ.
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🛹 Играть", callback_game=CallbackGame())],
            [
                InlineKeyboardButton(
                    text="🏆 Общий топ",
                    url=f"{public_url}/leaders.html",
                )
            ],
        ]
    )
