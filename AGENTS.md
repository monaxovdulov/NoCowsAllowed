# NoCowsAllowed — Cow Skate

Telegram HTML5-игра (корова на скейте) + бот с соревнованием в чатах:
нативный лидерборд на карточке игры (Games API: sendGame/setGameScore)
и глобальный топ в собственной БД.

## Стек и устройство

- `backend/` — FastAPI + aiogram 3 + SQLModel + Alembic + PostgreSQL;
  пакет `cowskate-backend` в uv-workspace (root `pyproject.toml`).
- `backend/app/static/` — игра (`index.html`, копия `cow-skate-standalone.html`
  с хуком `cowskate:run-end`), `telegram-bridge.js` (Mini App init, отправка
  счёта, оверлей топа), `leaders.html` (публичный топ).
- Игровые сессии — HMAC-подписанный токен `?s=` в URL, выдаётся в
  `answerCallbackQuery` и связывает счёт с конкретным игровым сообщением
  (chat_id+message_id / inline_message_id) для `setGameScore`.
- Webhook `POST /telegram/webhook` с проверкой
  `X-Telegram-Bot-Api-Secret-Token`; регистрация webhook — в lifespan при
  production-старте.

## Команды

```sh
cd backend && uv sync          # зависимости (uv, python 3.14 toolchain)
uv run pytest                  # тесты (sqlite, без Postgres)
uvx ruff check .               # линт
docker compose up --build      # dev: app:8000 + postgres
```

## Деплой (production, общий Caddy botops)

Runtime-клон: `/home/devuser/deploy/cowskate`, секреты в `.env` там же
(не коммитить). Деплой — `botops-compose deploy /home/devuser/deploy/cowskate
--latest`; домен `cowskate.apps.botops.ru` — override
`/srv/botops/staging-overrides/cowskate.caddy`.

## Правила

- План UX/геймплея — `docs/gameplay-ux-plan.md` (обсуждение агентами:
  туториал с паузами, мёртвая петля, виды трамплинов). Код не менять,
  пока решения там не утверждены.
- Комментарии по-русски, ответы пользователю по-русски.
- Секреты только в `.env` runtime-каталога; в git не коммитить.
- `cow-skate-standalone.html` в корне — исходный артефакт игры; рабочая
  копия с Telegram-интеграцией — `backend/app/static/index.html`.
