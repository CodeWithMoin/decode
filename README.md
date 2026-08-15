# Decode

Decode is an AI-native production studio that turns technical source material into educational
videos the creator directs, scene by scene. The project is the primary artifact; a video is one
export from it. This repository is a walking skeleton: a Next.js studio, FastAPI modular monolith,
PostgreSQL, Redis, an outbox dispatcher, and an ARQ worker.

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

## Documentation

The authoritative doc set. Read the doc that owns a decision before changing anything near it.

| Doc | What it is |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Working guidance and the product + code invariants. Authoritative for contributors. |
| [MASTER.md](MASTER.md) | Design system + product invariants. Authoritative on design; every value is decided. |
| [AGENT-GRAPH.md](AGENT-GRAPH.md) | The orchestration model and state-model direction. Authoritative on execution/orchestration — DESIGNED, in progress; not yet built. |
| [VISUALIZER-TO-HYPERFRAMES.md](VISUALIZER-TO-HYPERFRAMES.md) | The plan to move the render substrate from Remotion to HyperFrames. DESIGNED; one scene ported by hand so far. |
| [AUDIO-SYNC-PROPOSAL.md](AUDIO-SYNC-PROPOSAL.md) | Beat/anchor timing plus the Sound Designer department. Timing model is BUILT; sound design is DESIGNED. |
| [flow.md](flow.md) | How a project moves end to end — the current department pipeline. |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Vision and the backend departments — the "why". |
| [decisions.md](decisions.md) | The decisions log. |
