# One image, three processes. The API, the outbox dispatcher and the ARQ worker
# are the same codebase started three different ways, so they can never drift
# apart in dependencies or migration state.
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

COPY --from=ghcr.io/astral-sh/uv:0.7.8 /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies resolve from the lockfile and cache separately from source, so a
# code change does not reinstall the world.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY . .
RUN uv sync --frozen --no-dev && chmod +x docker-entrypoint.sh

# DECODE_PROCESS selects api, dispatcher or worker. Railway injects PORT.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
