# NoCowsAllowed — Cow Skate

Telegram HTML5-игра (корова на скейте) + бот с соревнованием в чатах:
нативный лидерборд на карточке игры (Games API: sendGame/setGameScore)
и глобальный топ в собственной БД.

## Стек и устройство

- `backend/` — FastAPI + aiogram 3 + SQLModel + Alembic + PostgreSQL;
  пакет `cowskate-backend` в uv-workspace (root `pyproject.toml`).
- `backend/app/static/` — игра: `index.html` (DOM + CSS, грузит
  `<script type="module" src="game/main.js">`), `game/*.js` — ES-модули без
  сборки (assets, utils, constants, state, layout, sprites, player, features,
  effects, render, ui, main), `telegram-bridge.js` (Mini App init, отправка
  счёта по событию `cowskate:run-end`, оверлей топа), `leaders.html`
  (публичный топ).
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
make standalone                # пересобрать cow-skate-standalone.html из game/*.js
docker compose up --build      # dev: app:8000 + postgres
```

## Деплой (production, общий Caddy botops)

Runtime-клон: `/home/devuser/deploy/cowskate`, секреты в `.env` там же
(не коммитить). Деплой — `botops-compose deploy /home/devuser/deploy/cowskate
--latest`; домен `cowskate.apps.botops.ru` — override
`/srv/botops/staging-overrides/cowskate.caddy`.

## Развитие игры (читать перед любой правкой game/\*.js)

Игра растёт маленькими шагами в сторону **сложных конструкций на трассе**
(трамплины разной формы, столы, ямы, рейлы/грайнд, мёртвые петли — через
всё это делаются трюки). Документы и порядок:

1. `docs/refactoring-map.md` — **утверждённая** карта рефакторинга
   (стиль и паттерны по скилам metarhia/metaskills: `js-conventions`,
   `js-data-structures`, `data-structures`, `js-gof`, `error-handling`).
   Раздел 3 — принятые решения D1–D10, раздел 4 — этапы 1–6 по порядку,
   раздел 5 — архитектура конструкций и **рецепт добавления новой**.
   Начинать с первого этапа без пометки «Выполнено»; после этапа —
   отметить его в карте.
2. `docs/gameplay-ux-plan.md` — геймдизайн: туториал-гейты (A), петля
   (B), виды трамплинов (C), библиотеки (D). Фичи A–C делаются поверх
   рефакторинга: A — после этапа 4, B/C — после этапа 5. Открытые
   геймплейные вопросы в конце плана решает пользователь.
3. `backend/app/static/game/types.d.ts` — все типы, только `.d.ts`
   (без TS-исходников и бандлера). Подключение из JS — JSDoc
   `/** @type {import('./types').GameState} */`, проверка
   `tsc --checkJs`. Нижняя часть файла — целевой контракт
   (`TrackFeature`, `FeatureTypeSpec`, `RideSpec`, `PlayerMode`,
   `GameEventMap`): при реализации этапов 3–5 — синхронно уточнять.

Ключевые решения (подробно — карта, раздел 3):

- Конструкция = запись `FeatureTypeSpec` в `game/track/<вид>.js`,
  зарегистрированная в таблице `FEATURE_TYPES`; взаимодействие через
  хуки `ground` (поверхность), `collide` (препятствие), `ride` (катание
  по траектории: петля, рейл). Не добавлять `if (f.type === …)` в движок.
- Фича трассы — одна форма `{id, type, x0, x1, data}`; `x0/x1` — мировые
  пиксели, всё в `data` — в ростах коровы.
- Игрок — автомат `mode: ground | air | ride | crash`; падения с
  причиной `crash(reason)`.
- Модель не зовёт UI/эффекты напрямую — события через `EventTarget`
  (`events.js`), подписки в `main.js`.
- Гейт каждого коммита: lint, typecheck, `make standalone` + pytest,
  детерминированный снапшот (`npm run snapshot`, после этапа 1). Чистые
  рефакторинги не меняют хэши; поведенческие коммиты — отдельно, с
  обновлённым эталоном. Порядок вызовов `Math.random` — часть поведения.

## Правила

- Комментарии по-русски, ответы пользователю по-русски.
- Секреты только в `.env` runtime-каталога; в git не коммитить.
- Код игры правится только в `backend/app/static/index.html` и
  `backend/app/static/game/*.js`. `cow-skate-standalone.html` в корне —
  генерируемый однофайловый артефакт (`make standalone`,
  `tools/build-standalone.py`: модули инлайном, без Telegram-блока
  `telegram:begin/end`); руками не править, pytest проверяет свежесть.
- В модулях импортированные биндинги read-only: общий мутируемый стейт —
  свойства объектов (`S`, `G`), а переприсваиваемые `let` меняет только
  модуль-владелец (сеттеры `setCAM`, `setPerfScale`, `initAssets`).
