# Decode

Decode's walking skeleton consists of a Next.js studio, FastAPI modular monolith, PostgreSQL,
Redis, an outbox dispatcher, and an ARQ worker.

## Local development

Prerequisites: Docker Desktop, Node.js with npm, Python 3.11+, and optionally `uv`. Start Docker
Desktop before running the development stack.

```bash
make setup
make dev
```

`make dev` starts PostgreSQL and Redis, applies migrations, and runs the API, dispatcher, worker,
and frontend. Stop the application processes with `Ctrl-C`; local infrastructure and database data
remain available for the next run.

Open the studio at <http://localhost:3000/studio> and FastAPI documentation at
<http://localhost:8000/docs>.

Useful commands:

```bash
make help
make test
make check
make infra-status
make infra-down
```

The current Producer is deterministic and local. It does not call an LLM, TTS provider, or video
renderer yet.
