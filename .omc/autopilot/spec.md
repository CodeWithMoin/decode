# Decode walking-skeleton implementation specification

**Status:** Approved for implementation by the user on 2026-08-04  
**Source contracts:** `.omc/plans/decode-backend-foundation.md` and `.omc/plans/decode-v1-ui-backend-contract.md`

## Objective

Deliver the first production-quality vertical slice of Decode without implementing later video-pipeline capabilities.

The slice must let a user create a project, attach one or more sources, publish Production Intent, request Production Brief generation, observe durable progress, review and edit immutable Production Brief versions, approve an exact version, and inspect history/lineage. Generation and evaluation are deterministic fakes executed through the same department and worker contracts intended for real providers.

## Required architecture

- Python/FastAPI modular monolith with separate API and ARQ worker processes.
- Standard PostgreSQL through SQLAlchemy 2 and Alembic; SQLite may be used only for fast automated tests where semantics remain equivalent.
- PostgreSQL is canonical for projects, sources, artifacts/versions/dependencies/projections, approvals, evaluations, jobs/runs, usage, progress events, idempotency, and outbox.
- Redis/ARQ is delivery only.
- Transactional outbox dispatches committed jobs to ARQ with at-least-once/idempotent execution.
- Cloudflare R2 object-store adapter plus local/test adapter; no persistent Railway filesystem use.
- Immutable ArtifactVersion content with distinct latest and approved projections.
- Exact source and intent version bindings for generated briefs.
- Focused context manifest persisted on the Run.
- Durable SSE events with reconnect using Last-Event-ID.
- One configured internal actor provider; actor identity never comes from command bodies.
- Renderer port exists as a boundary only. No HyperFrames package or adapter.

## Backend behavior

Implement the commands and queries defined in `.omc/plans/decode-v1-ui-backend-contract.md`, including idempotency, edit conflict handling, run retry, job usage, history, and lineage.

The fake Producer creates a schema-v1 Production Brief containing summary, audience profile, objectives, concepts, prerequisites, scope, teaching opportunities, source findings, and open questions. The fake evaluator records structured checks but never revises or gates human approval. Usage records contain raw facts and estimated USD cost only.

## Frontend behavior

Preserve the current visual design. Add URL-addressable studio/new/project/job routes and a typed API/SSE seam. Zustand remains responsible only for transient interaction state.

- Dashboard loads real projects when backend configuration is present.
- New Decode retains the existing composer and repeatable multi-source UX, then executes project → sources → intent → generation.
- Processing replaces timers with job query + durable SSE for connected projects.
- Understanding becomes a real Production Brief review surface with edit, approve, evaluation, history, and lineage.
- Teaching Plan, Script, Edit, and Export stay visible but locked only for this milestone.
- Discussion/Production Room actions that would fake persistence are hidden or disabled in the connected milestone.

## Explicit exclusions

Real LLM calls, OCR/extraction, Director, Writer, scenes, TTS, ElevenLabs, visual specifications, renderer implementation, HyperFrames, timeline, export, discussions, checkpoint engine, credits/billing, and public multi-user authentication.

## Quality gates

- Backend formatting/lint/type checks and automated tests pass.
- Alembic upgrades a clean database.
- At-least-once duplicate execution does not publish duplicate output.
- Editing preserves old versions and approved pointer semantics.
- SSE terminal recovery works from canonical queries.
- Frontend lint and production build pass.
- No seeded project/artifact/job state is used on connected routes.
- Architecture, security, and code-quality review find no blocking issue.

