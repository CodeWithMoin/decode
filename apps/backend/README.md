# Decode backend walking skeleton

FastAPI modular monolith plus an ARQ worker. PostgreSQL is canonical; SQLite is supported for tests.

For the complete local stack, run `make setup` followed by `make dev` from the repository root.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
uvicorn decode.main:app --reload
arq decode.execution.worker.WorkerSettings
```

Run `python -m decode.execution.dispatcher` as the transactional-outbox dispatcher. API mutations require `Idempotency-Key`. The development actor is configured server-side and must only be used behind a trusted private-beta boundary.

CORS is not authentication. A production process refuses to start unless
`DECODE_TRUSTED_ACCESS_BOUNDARY_CONFIRMED=true` explicitly confirms that a trusted boundary such
as Cloudflare Access, a private reverse proxy, or a future authentication adapter protects it.
Do not expose the Railway API publicly before that deployment decision is implemented.

R2 deployments must configure an object lifecycle rule that aborts incomplete multipart uploads.
The durable `sources` staging row records a lease-owned, per-attempt object key so a stale uploader
cannot overwrite or delete its successor's object. The R2 lifecycle rule covers a hard crash between
multipart creation and completion where no application cleanup handler can run.
