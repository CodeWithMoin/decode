# Decode walking-skeleton implementation plan

**Status:** Approved execution scope  
**Spec:** `.omc/autopilot/spec.md`

## Stage 1 — Backend foundation

1. Create `apps/backend` with FastAPI, SQLAlchemy 2 async sessions, Alembic, Pydantic settings, ARQ, Redis, S3/R2 adapter, and test tooling.
2. Add coarse packages: `projects`, `artifacts`, `execution`, and `providers`.
3. Define portable SQLAlchemy entities and one initial Alembic migration for the walking-skeleton ledger.
4. Add settings, lifecycle, health/readiness, CORS, structured request IDs, and configured internal actor context.

## Stage 2 — Domain and API slice

1. Implement canonical hashing, immutable artifact publication, exact dependency edges, latest/approved projections, optimistic edit concurrency, evaluation, approvals, raw usage, and history/lineage queries.
2. Implement project creation/list/studio queries, streaming source upload to object storage, and Production Intent publication.
3. Implement Generate Production Brief transaction: Job + initial Run + input bindings + OutboxEvent.
4. Implement typed problem responses and command idempotency.

## Stage 3 — Execution and progress

1. Implement deterministic fake Producer and evaluator behind a department contract.
2. Implement outbox dispatch to ARQ and idempotent worker execution/publication.
3. Persist progress events and expose project SSE with Last-Event-ID replay.
4. Implement failed-run retry and job/usage queries.

## Stage 4 — Frontend connection

1. Add durable Next.js routes and typed HTTP/SSE client while preserving the prototype route.
2. Connect Dashboard and New Decode to real APIs.
3. Connect Processing to job queries/SSE with truthful milestone steps and retry.
4. Add a Production Brief review stage with edit, approve, evaluation, history, and lineage.
5. Hydrate the project shell from a studio snapshot and lock only unimplemented stages.

## Stage 5 — Verification

1. Unit-test hashes, artifact immutability/projections, conflict behavior, context isolation, fake evaluation, and state transitions.
2. Integration-test project/source/intent/generation/edit/approval/history, outbox idempotency, Redis-loss truth, and SSE replay.
3. Run Alembic upgrade, backend lint/type/test suite, frontend lint/build, and an end-to-end local smoke test.
4. Review architecture boundaries, secrets/upload security, authorization assumptions, error disclosure, dependency risks, and maintainability.

## Stop line

After the walking skeleton passes, do not add a real model, TTS, renderer, downstream departments, or discussions. Report results and request authorization for the next vertical slice.

