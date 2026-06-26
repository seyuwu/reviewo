COMPOSE = docker compose
COMPOSE_DEV = $(COMPOSE) --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD = $(COMPOSE) --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml
PNPM = corepack pnpm

.PHONY: dev down build rebuild logs clean lint typecheck format test prod prod-down prod-logs

dev:
	$(COMPOSE_DEV) up

down:
	$(COMPOSE_DEV) down --remove-orphans

build:
	$(COMPOSE_DEV) build

rebuild:
	$(COMPOSE_DEV) build --no-cache
	$(COMPOSE_DEV) up

logs:
	$(COMPOSE_DEV) logs -f

clean:
	$(COMPOSE_DEV) down -v --remove-orphans

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

format:
	$(PNPM) format

test:
	$(PNPM) test

prod:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down --remove-orphans

prod-logs:
	$(COMPOSE_PROD) logs -f
