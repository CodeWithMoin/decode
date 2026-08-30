# Combined image: the FastAPI backend (api / dispatcher / worker) AND the
# frontend render toolchain in one container, because the worker renders video
# and runs the vision gate by shelling out to `npx tsx apps/frontend/scripts/
# render-*.ts` — which needs Node, the frontend node_modules, and a headless
# Chrome. One image, three processes (DECODE_PROCESS), so they never drift.
#
# Build context is the REPO ROOT (needs both apps/). The frontend and backend
# stay SIBLINGS under /app/apps/* because the render bundler resolves
# @decode/seeds as apps/frontend/../backend/decode/agents/renderer/seeds.
#
# Build on linux/amd64 (Railway) — the frontend's native modules (@remotion/
# renderer, esbuild) are copied from the node stage and must match the run arch.

# ---- Stage 1: frontend deps (lockfile-clean node_modules) ----
FROM node:22-bookworm-slim AS frontend
WORKDIR /fe
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci
COPY apps/frontend ./

# ---- Stage 2: final — Python backend + Node + headless Chrome ----
FROM python:3.13-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:/usr/local/bin:$PATH \
    # Absolute so the worker's render subprocess (cwd is the backend) still finds
    # the frontend. Overrides config's relative "apps/frontend" default.
    DECODE_RENDER_CWD=/app/apps/frontend

# System libraries Remotion's Chrome Headless Shell needs on Debian bookworm
# (the documented list — bookworm avoids trixie's t64 package renames), plus
# fonts for text rendering and ffmpeg for the audio mux. curl/gnupg are for the
# NodeSource key below.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg ffmpeg fonts-liberation \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
      libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/*

# Node 22 for the render scripts (npx / tsx / Remotion).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.7.8 /uv /usr/local/bin/uv

# ---- Backend deps (cache on the lockfile before source) ----
WORKDIR /app/apps/backend
COPY apps/backend/pyproject.toml apps/backend/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY apps/backend/ ./
RUN uv sync --frozen --no-dev && chmod +x docker-entrypoint.sh

# ---- Frontend (with node_modules) as a sibling of the backend ----
COPY --from=frontend /fe /app/apps/frontend

# Download the exact Chrome Headless Shell Remotion 4.0.508 renders with, into
# the image, so the first render doesn't fetch it at runtime. Programmatic (and
# awaited) rather than the CLI, so it can't miss a subcommand rename.
RUN cd /app/apps/frontend && node -e "require('@remotion/renderer').ensureBrowser().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"

# The backend process runs from its own dir (alembic.ini + entrypoint live here);
# `decode` is installed into the venv so uvicorn imports it from anywhere.
WORKDIR /app/apps/backend
ENTRYPOINT ["/app/apps/backend/docker-entrypoint.sh"]
