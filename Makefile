.PHONY: dev down test lint fix migrate deploy standalone

dev:
	docker compose up --build

down:
	docker compose down

test:
	cd backend && uv run pytest

lint:
	cd backend && uvx ruff check . && uvx ruff format --check .
	npm run lint

fix:
	npm run fix

standalone:
	python3 tools/build-standalone.py

migrate:
	docker compose run --rm app alembic upgrade head

# Прод-деплой: runtime-клон в /home/devuser/deploy/cowskate,
# см. .botops-deploy.env и skill botops-deploy.
deploy:
	botops-compose deploy /home/devuser/deploy/cowskate --latest
