# Deploying the Decode backend to Railway

Three services, one image, one repository root (`apps/backend`). They differ
only in the `DECODE_PROCESS` variable, so they can never drift apart in
dependencies or migration state.

| Service | `DECODE_PROCESS` | Runs |
|---|---|---|
| `api` | `api` | `alembic upgrade head`, then `uvicorn decode.main:app` |
| `dispatcher` | `dispatcher` | `python -m decode.execution.dispatcher` |
| `worker` | `worker` | `arq decode.execution.worker.WorkerSettings` |

`docker-entrypoint.sh` switches on that variable. A per-service start command
would have worked too, but only as a dashboard setting — and all three services
share one root directory, so a committed `railway.json` would apply its start
command, healthcheck and pre-deploy to all of them. Selecting the process with a
variable keeps the whole deployment reproducible from the repository. An
unrecognised value exits non-zero rather than silently booting an API.

Only the API migrates. Three services running `alembic upgrade head`
concurrently on one database is a race with no upside; the dispatcher and worker
may briefly crash-loop on a fresh deploy until the API finishes, and Railway
restarts them.

`compose.yaml` at the repository root is local development only. Railway
supplies PostgreSQL and Redis as managed plugins.

## Provisioning

```bash
railway login          # interactive — run this yourself
railway init           # or: railway link, for an existing project
railway add --database postgres
railway add --database redis
```

Then create the three services. Railway auto-detects the `Dockerfile`; deploy
each from `apps/backend` with `railway up --service <name>`.

`railway add` **requires `--json`**. Without it the CLI drops into an
interactive picker, prints a prompt, and exits having done nothing — which reads
as a failure and invites you to run it again, creating a duplicate.

## Environment

Set on **all three** services:

```
DECODE_DATABASE_URL=postgresql+asyncpg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DECODE_REDIS_URL=${{Redis.REDIS_URL}}
DECODE_ENVIRONMENT=production
DECODE_ACTOR_ID=internal-private-beta-user
DECODE_OBJECT_STORE=r2
DECODE_R2_ENDPOINT_URL=...
DECODE_R2_ACCESS_KEY_ID=...
DECODE_R2_SECRET_ACCESS_KEY=...
DECODE_R2_BUCKET=...
DECODE_TRUSTED_ACCESS_BOUNDARY_CONFIRMED=true
DECODE_PROCESS=api | dispatcher | worker
```

`DECODE_R2_*` belongs on `api` and `worker` only — the dispatcher never touches
storage, so it never needs the credentials.

API only, once a frontend exists:

```
DECODE_FRONTEND_ORIGIN=https://<the Vercel deployment>
```

**Paste real values, not the placeholders.** Railway accepts `<your-bucket>`
happily and the failure surfaces much later as a 503 on first upload. Two
specifics that cost time here: the endpoint is account-level and must **not**
include the bucket (`https://<account-id>.r2.cloudflarestorage.com`), and a
smart-quote pasted from a rich-text editor will break request signing while
looking correct.

**`DECODE_DATABASE_URL` must be assembled from the component variables, not
copied from `${{Postgres.DATABASE_URL}}`.** Railway emits a `postgresql://`
URL; SQLAlchemy needs the `+asyncpg` driver suffix. Alembic converts it back to
`+psycopg` itself via `Settings.sync_database_url`, so one variable serves both.

## Two settings that are decisions, not checkboxes

**`DECODE_TRUSTED_ACCESS_BOUNDARY_CONFIRMED=true`.** The application refuses to
start in production without it, and that refusal is the point: the walking
skeleton has no authentication, and the configured actor identity is trusted
implicitly. Setting this asserts that something in front of the API — Cloudflare
Access, a private proxy, or an auth adapter — is actually restricting who
reaches it. CORS is not that thing. Do not set this to satisfy the startup check
on a publicly reachable service.

**An R2 lifecycle rule aborting incomplete multipart uploads.** The durable
`sources` staging row records a lease-owned, per-attempt object key so a stale
uploader cannot overwrite its successor's object. The lifecycle rule covers the
case application code cannot: a hard crash between `create_multipart_upload` and
`complete_multipart_upload`, where no cleanup handler runs. Without it, failed
uploads accrue as billable orphaned parts that never appear in a bucket listing.

## Verifying the deployment

The database is only reachable on Railway's private network, so the scripts run
inside a deployed container:

```bash
railway ssh keys add                 # once, then accept the host key on first connect
railway ssh --service api -- uv pip install httpx   # see note below
railway ssh --service api -- python -m scripts.verify_object_store
railway ssh --service api -- python -m scripts.verify_postgres_worker
railway ssh --service api -- python -m scripts.verify_postgres_upload_lease
```

Expected: `object_store=passed`, `postgres_redis_arq_walking_skeleton=passed`,
`postgres_upload_lease=passed`.

Run `verify_object_store` after changing any `DECODE_R2_*` variable. Storage
configuration cannot be checked by booting the app — a wrong endpoint, region,
bucket or key only fails on the first upload, which in production is a user
losing their source file.

**`httpx` is a dev dependency and the image builds `--no-dev`**, so the two
walking-skeleton scripts need it installed into the running container first.
That install is ephemeral and disappears on the next deploy. Either promote
`httpx` to a runtime dependency or rewrite those scripts against the HTTP
surface instead of `ASGITransport`.

Then confirm the deployment-specific properties the scripts cannot cover:

- Restart the worker mid-run; the job resumes and publishes exactly one version.
- Flush Redis; PostgreSQL still answers project, job, artifact, evaluation,
  approval, and usage queries.
- Confirm no service writes to local disk for persistence
  (`DECODE_OBJECT_STORE=r2`, not `local`).
