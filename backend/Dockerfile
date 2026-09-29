FROM ghcr.io/astral-sh/uv:0.9.26 AS uv

FROM python:3.14.7-slim AS backend-base

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY --from=uv /uv /bin/uv
WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/pyproject.toml

FROM backend-base AS development

RUN uv sync --frozen --package cowskate-backend --no-install-workspace
COPY backend backend
RUN uv sync --frozen --package cowskate-backend
WORKDIR /app/backend
CMD ["sh", "entrypoint.sh"]

FROM backend-base AS production

RUN uv sync --frozen --no-dev --package cowskate-backend --no-install-workspace
COPY backend backend
RUN uv sync --frozen --no-dev --package cowskate-backend
WORKDIR /app/backend
CMD ["sh", "entrypoint.sh"]
