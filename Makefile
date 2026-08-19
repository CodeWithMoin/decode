SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT_DIR)/apps/backend
FRONTEND_DIR := $(ROOT_DIR)/apps/frontend
BACKEND_PYTHON := $(BACKEND_DIR)/.venv/bin/python
BACKEND_ALEMBIC := $(BACKEND_DIR)/.venv/bin/alembic
BACKEND_ARQ := $(BACKEND_DIR)/.venv/bin/arq


.PHONY: help setup env backend-install frontend-install docker-ready infra infra-down infra-status \
	migrate api dispatcher worker frontend dev dev-down langfuse langfuse-down test check

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Decode development commands\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: env backend-install frontend-install ## Install dependencies and create local env files

env: ## Create local env files without overwriting existing configuration
	@test -f $(BACKEND_DIR)/.env || cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env
	@test -f $(FRONTEND_DIR)/.env.local || cp $(FRONTEND_DIR)/.env.example $(FRONTEND_DIR)/.env.local

backend-install: ## Install backend and development dependencies
	@if command -v uv >/dev/null 2>&1; then \
		cd $(BACKEND_DIR) && uv sync --extra dev; \
	else \
		python3 -m venv $(BACKEND_DIR)/.venv && \
		$(BACKEND_PYTHON) -m pip install -e '$(BACKEND_DIR)[dev]'; \
	fi

frontend-install: ## Install locked frontend dependencies
	@cd $(FRONTEND_DIR) && npm ci

docker-ready:
	@command -v docker >/dev/null 2>&1 || (echo "Docker is required. Install and start Docker Desktop." && exit 1)
	@docker info >/dev/null 2>&1 || (echo "Docker is installed but not running. Start Docker Desktop and try again." && exit 1)

infra: docker-ready ## Start local PostgreSQL and Redis with Docker Compose
	@docker compose -f $(ROOT_DIR)/compose.yaml up -d --wait postgres redis

infra-down: docker-ready ## Stop local PostgreSQL and Redis without deleting their data
	@docker compose -f $(ROOT_DIR)/compose.yaml down

infra-status: docker-ready ## Show local infrastructure status
	@docker compose -f $(ROOT_DIR)/compose.yaml ps

migrate: env ## Apply database migrations
	@test -x $(BACKEND_ALEMBIC) || (echo "Backend dependencies are missing. Run 'make setup'." && exit 1)
	@cd $(BACKEND_DIR) && $(BACKEND_ALEMBIC) upgrade head

api: env ## Run the FastAPI development server
	@test -x $(BACKEND_PYTHON) || (echo "Backend dependencies are missing. Run 'make setup'." && exit 1)
	@cd $(BACKEND_DIR) && $(BACKEND_PYTHON) -m uvicorn decode.main:app --reload

dispatcher: env ## Run the transactional-outbox dispatcher
	@test -x $(BACKEND_PYTHON) || (echo "Backend dependencies are missing. Run 'make setup'." && exit 1)
	@cd $(BACKEND_DIR) && $(BACKEND_DIR)/.venv/bin/watchfiles "$(BACKEND_PYTHON) -m decode.execution.dispatcher" decode

worker: env ## Run the ARQ worker
	@test -x $(BACKEND_ARQ) || (echo "Backend dependencies are missing. Run 'make setup'." && exit 1)
	@cd $(BACKEND_DIR) && $(BACKEND_ARQ) --watch decode decode.execution.worker.WorkerSettings

frontend: env ## Run the Next.js development server
	@test -d $(FRONTEND_DIR)/node_modules || (echo "Frontend dependencies are missing. Run 'make setup'." && exit 1)
	@cd $(FRONTEND_DIR) && npm run dev

dev: env infra migrate ## Run API, dispatcher, worker, and frontend; stop with Ctrl-C
	@set -m; \
	cleanup() { \
		trap - INT TERM EXIT; \
		kill $$api_pid $$dispatcher_pid $$worker_pid $$frontend_pid 2>/dev/null || true; \
		wait $$api_pid $$dispatcher_pid $$worker_pid $$frontend_pid 2>/dev/null || true; \
	}; \
	trap cleanup INT TERM EXIT; \
	$(MAKE) --no-print-directory api & api_pid=$$!; \
	$(MAKE) --no-print-directory dispatcher & dispatcher_pid=$$!; \
	$(MAKE) --no-print-directory worker & worker_pid=$$!; \
	$(MAKE) --no-print-directory frontend & frontend_pid=$$!; \
	wait

dev-down: ## Stop anything left running from 'make dev'; leaves Postgres and Redis up
	@# Ctrl-C kills the make subprocesses but their children can outlive them, and
	@# the survivors then hold 8000 and 3000 so the next 'make dev' half-starts.
	@# Patterns are absolute so a sibling checkout's dev server is never touched.
	@pkill -f "$(BACKEND_DIR)/.venv/bin/python -m uvicorn decode.main:app" 2>/dev/null || true
	@pkill -f "$(BACKEND_DIR)/.venv/bin/python -m decode.execution.dispatcher" 2>/dev/null || true
	@pkill -f "$(BACKEND_DIR)/.venv/bin/arq .*decode.execution.worker" 2>/dev/null || true
	@pkill -f "$(FRONTEND_DIR)/node_modules/.bin/next dev" 2>/dev/null || true
	@sleep 1
	@# 3001 is deliberately absent: Langfuse owns it, runs in Docker, and is
	@# stopped by 'make langfuse-down' rather than by anything 'make dev' started.
	@for port in 8000 3000; do \
		if lsof -nP -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "port $$port still in use — run: lsof -nP -iTCP:$$port -sTCP:LISTEN"; \
		fi; \
	done
	@echo "dev stopped. Postgres and Redis are still up — 'make infra-down' stops those."

langfuse: docker-ready ## Start self-hosted Langfuse on :3001 for prompt work
	@docker compose -f $(ROOT_DIR)/compose.langfuse.yaml up -d
	@echo "Langfuse starting at http://localhost:3001 — first boot takes 2-3 minutes."
	@echo "Create a project there, then put its keys in $(BACKEND_DIR)/.env:"
	@echo "  DECODE_LANGFUSE_PUBLIC_KEY=pk-lf-..."
	@echo "  DECODE_LANGFUSE_SECRET_KEY=sk-lf-..."
	@echo "Restart the worker afterwards; tracing is read once at startup."

langfuse-down: ## Stop Langfuse; traces are kept in its volumes
	@docker compose -f $(ROOT_DIR)/compose.langfuse.yaml down

test: ## Run the fast backend and frontend test/typecheck suite
	@cd $(BACKEND_DIR) && $(BACKEND_PYTHON) -m pytest -q
	@cd $(FRONTEND_DIR) && npm run lint
	@cd $(FRONTEND_DIR) && npx tsc --noEmit

check: ## Run all backend and frontend quality gates, including production build
	@cd $(BACKEND_DIR) && $(BACKEND_PYTHON) -m ruff check decode tests scripts
	@cd $(BACKEND_DIR) && $(BACKEND_PYTHON) -m mypy decode
	@cd $(BACKEND_DIR) && $(BACKEND_PYTHON) -m pytest -q
	@cd $(FRONTEND_DIR) && npm run lint
	@cd $(FRONTEND_DIR) && npx tsc --noEmit
	@cd $(FRONTEND_DIR) && NEXT_DIST_DIR=.next-check npm run build
