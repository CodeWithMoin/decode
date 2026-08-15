# decisions.md — decisions taken on Decode, and why

A running log of load-bearing choices, so nobody re-litigates a settled one.
Two parts: the **architecture decisions** (the ADRs, condensed from
`.omc/plans/decode-backend-foundation.md` §29 — read the plan for full context)
and the **session decisions** made while building (newest last). Where this and
`MASTER.md` disagree about design, `MASTER.md` wins; this file is about
*why the system is shaped the way it is*.

---

## Part 1 — Architecture decisions (ADRs)

**ADR-001 — Modular monolith, not department microservices.**
The eight departments are modules in one FastAPI app, not services. One deploy,
one database, in-process routing. Microservices were rejected as premature for a
solo founder; the module boundaries keep the option open.

**ADR-002 — Immutable ArtifactVersion + mutable projections.**
A version is written once and never changed — enforced by a **Postgres trigger**,
not just app code. "Latest" and "approved" are separate mutable pointers on the
Artifact. Editing publishes a new version; you never overwrite one.

**ADR-003 — Exact-version dependency edges.**
Lineage records the *exact* version a stage consumed, so regeneration and
staleness are precise: changing Scene 5's script invalidates only what descends
from that version.

**ADR-004 — Postgres transactional outbox + ARQ.**
Async work is handed off by writing an OutboxEvent in the same transaction as the
Job/Run, then a dispatcher enqueues to ARQ/Redis. At-least-once with a stable
`_job_id`; the worker re-checks `active_run_id` and returns `stale_run` rather
than double-publishing. (See `flow.md` §7.)

**ADR-005 — Audio is the timing authority.**
Real narration duration drives scene timecodes and project runtime. Nothing
"syncs" timing — it is derived from measured audio + placement. This is why voice
had to become part of the auto-chain (session decision S-06).

**ADR-006 — Five product crew roles, eight execution departments.**
The creator sees five specialists (Producer, Director, Writer, Motion Designer,
Editor). Internally there are more execution departments. Crew identity belongs
to the *work* (handoffs, receipts), never to global chrome.

**ADR-007 — HyperFrames behind a renderer port.**
Adopt HyperFrames only as a replaceable render substrate behind a Decode-owned
boundary (`providers/renderer.py`), never as the framework. No adapter exists
yet; the worker currently shells out to a Node/Remotion script.

**ADR-008 — Railway + provider-neutral Postgres for V1.**
Managed Postgres on Railway for V1; the code stays provider-neutral so it can
move. (See the plan §21, §29.)

**ADR-009 — Walking-skeleton implementation profile.**
Build one thin vertical slice end to end (create → fake Producer → brief → edit →
approve) before adding real providers, so domain semantics and provider
variability are never debugged at the same time. The system has since grown all
five real departments on top of this skeleton.

---

## Part 2 — Session decisions (build log)

### S-01 — Evaluator routing moved into the pipeline layer, not made a stage
**Decision:** Extract the inline brief/plan evaluation out of `worker.py` into
`pipeline.run_evaluation()`. **Explicitly did NOT** make the evaluator a
first-class CHAIN stage with its own job.
**Why:** The evaluator produces an `Evaluation` *about* a version, not a new
artifact version, and it must run in the *same run/transaction* as generation so
`artifact.ready_for_review` can carry the decision atomically. A separate stage
would split that transaction and add a queue round-trip — more code, changed
semantics. The real inconsistency was only *where the routing lived* (the worker
special-cased artifact types), so the fix was to move that policy to the Project
Manager layer where routing belongs.
**Applies to:** future evaluation of script/visuals → add to `EVALUATED_TYPES` +
an evaluator method, not a new job.

### S-02 — Real-path Fish Audio test, mocking only the network
**Decision:** Add tests that exercise the real `FishAudioNarrator._synthesize`
(URL, auth header, request body, object-store write, failure propagation) by
monkeypatching `httpx.AsyncClient.post`, rather than testing the fake narrator.
**Why:** Voice was the least-tested stage that already ships to users; the fake
narrator gave no confidence in the actual HTTP contract. Mocking at the transport
edge keeps everything else real (storage, duration estimate, findings).

### S-03 — Fish Audio `model` header added (was missing)
**Decision:** Send Fish Audio's `model` header on every TTS request; record which
backbone spoke in `voice_findings`. New setting `DECODE_FISH_AUDIO_MODEL`.
**Why:** Fish Audio's own example sends `model` as a header, not in the body.
Without it the API silently falls back to an older default model — a real bug for
production use that fixtures could never catch.

### S-04 — Default TTS model is the free tier (`s2.1-pro-free`)
**Decision:** `fish_audio_model` defaults to `s2.1-pro-free`; paid keys override
to `s2-pro` / `s1` via env.
**Why:** Solo-founder cost discipline — the free tier should work out of the box
without an env override; paying is an explicit opt-in.

### S-05 — Test suite must be deterministic regardless of a developer `.env`
**Decision:** `conftest.py` now also nulls `DECODE_VOICE`, `DECODE_FISH_AUDIO_*`
(matching the existing pattern for intake/evaluator/Langfuse). Fish tests pass
their own explicit `Settings`.
**Why:** A real `.env` (which now has live Fish + Langfuse creds) was leaking into
tests — `Settings()` picked up real values, so a "missing credentials raises"
guard didn't fire and a model assertion read the developer's `.env` model. The
suite must never depend on whose machine runs it, and must never reach a paid
provider.

### S-06 — Voice joined the auto-chain (`scene_visuals → voice`)
**Decision:** Add `"generate_scene_visuals": "generate_voice"` to `CHAIN`.
**Why:** Voice was a fully built stage that never ran automatically, so an
auto-continuing project produced visuals but no narration — yet **audio is the
timing authority** (ADR-005), so scenes had no runtime to derive. The existing
input-carry logic already forwards script + intent, so it was a one-line edit.
**Consequence:** after visuals, an auto-continue project is legitimately still
`processing` (voice queued) rather than resting on Edit; it reaches Edit once
narration renders. The vertical-slice test was updated to assert this real flow.

### S-07 — Langfuse left OFF, keys preserved
**Decision:** Comment out `DECODE_LANGFUSE_PUBLIC_KEY` / `_SECRET_KEY` in `.env`
(keep `HOST`). Tracing enables only when *both* keys are present.
**Why:** The user wanted tracing off for now but to keep the ids for later.
Presence of both keys is the on-switch (`tracing.configure`); commenting them out
is the clean "off" without losing the values. Turn it back on by uncommenting +
running the Langfuse container (`compose.langfuse.yaml`).

### S-08 — Commit hygiene: scoped commits, secrets excluded, no co-author trailer
**Decision:** Committed the large WIP as three scoped commits on `main` — backend
(`daaa2bd`), frontend (`e148aa6`), docs (`e2fe7d5`) — excluding `.env`
(gitignored), `.vscode/`, `.claude/`, and the loose PNGs. No `Co-Authored-By`
trailer.
**Why:** The tree was ~80 uncommitted files mixing real work with editor config
and images. Scoped commits keep history reviewable; `.env` carries live secrets
and must never be committed; the no-co-author-trailer is a standing user
preference.
**Open:** `Makefile` + `compose.langfuse.yaml` (infra) still uncommitted;
`.vscode/`, `*.png`, `.omc/project-memory.json` are `.gitignore` candidates.

### S-09 — Single workspace: land in Edit, stages become inspector tabs (BUILT)
**Decision:** New projects run inputs → build screen → **Edit** automatically. The
Understanding / Plan / Script pages are **removed from nav** (reachable only by
deep link); plan and script become **tabs in the Edit inspector**. Edit is the one
workspace.
**Why:** The staged wizard made teaching the project feel like paperwork before the
video. Landing in Edit puts the artifact — the film — first; the earlier stages are
context you open when you need them, not gates you march through.
**Applies to:** the connected app is the single workspace; prototype/connected split
still exists in `apps/frontend/src`.

### S-10 — Continuous is the only mode; the auto_continue toggle removed (BUILT)
**Decision:** Remove the **Continuous / Stage-by-stage** (`auto_continue`) toggle
from the UI. Projects always run continuously. The backend `auto_continue` column
is **retained and honored** until the snapshot migration (S-12) lands.
**Why:** With a single workspace there is no stage to pause on, so a per-stage gate
was a choice with one sensible answer. Dropping the UI toggle without ripping out the
column keeps the change reversible and avoids a schema migration mid-pivot.

### S-11 — "Visualizer" role renamed to Motion Designer; contract names kept (BUILT)
**Decision:** The department's *role* is now the **Motion Designer** — how a beat's
teaching intent becomes animated, positioned and synced to narration. **Persisted
names stay unchanged on purpose:** artifact type `scene_visuals`, job kinds
`generate_scene_visuals` / `regenerate_scene_visual`, provider `DECODE_VISUALIZER`,
provenance `visualizer/<v>`, department folder `visualizer/`.
**Why:** "Motion Designer" is the honest creator-facing name for the work; the wire
contract, provenance ids and provider keys are load-bearing and renaming them buys a
migration for zero user value. Role is language; contract names are identity.

### S-12 — DIRECTION: snapshot + checkpoints replace per-artifact versions (DESIGNED, NOT built)
**Decision (direction, not shipped):** Replace the per-artifact immutable-version /
lineage model with a project **snapshot + checkpoints** model. Designed only — see
`AGENT-GRAPH.md §8`.
**Why:** As editing becomes dependency-aware across scenes, per-artifact version
pointers get awkward; a whole-project checkpoint is the cleaner unit to branch and
roll back. **Current reality:** immutable `ArtifactVersion` (ADR-002) + exact-version
edges (ADR-003) are still what runs.

### S-13 — HyperFrames adopted as the render substrate; migration begun (DESIGNED direction, one scene BUILT)
**Decision:** Commit to **HyperFrames as the render/composition substrate**: Decode
owns semantic **intent + timing**, HyperFrames owns executable composition +
deterministic rendering. The migration has **begun** — one scene ported by hand
(`hyperframes/self-attention/`), rendering deterministically. Full generalization is
designed in `VISUALIZER-TO-HYPERFRAMES.md`.
**Why:** Rendering and media are not the moat (knowledge → teaching → production
intelligence is); owning a render framework is undifferentiated weight. This
sharpens ADR-007 from "behind a port" to "the substrate we build on."
**Current reality:** the Motion Designer department still emits Remotion-flavored
React and the preview still uses `@remotion/player`; only the one scene is ported.

### S-14 — Beat-timing model: narration authority extended to sub-scene anchors (BUILT)
**Decision:** Add `decode/timing.py` — `NarrationTiming` with word timestamps and
semantic `Anchor`s resolving to seconds; narration clips carry `words`. Design in
`AUDIO-SYNC-PROPOSAL.md`.
**Why:** ADR-005 made *scene* timing derive from measured audio; teaching moments
land inside a scene, so the same authority must reach sub-scene events. Anchors let a
visual cue bind to a spoken phrase instead of a guessed offset. **Note:** the full
Sound Designer department / beat-sync system in the proposal is **DESIGNED, not
built**.

### S-15 — Evaluation becomes an optional hook, not a per-stage gate (DESIGNED direction)
**Decision (direction):** Evaluation moves from a per-stage gate toward an **optional
hook** in the orchestrated model — trust/quality checks you can attach, not a wall
every stage must clear. Framed alongside the orchestrator direction in
`AGENT-GRAPH.md`.
**Why:** A single continuous workspace shouldn't stall on a gate between invisible
stages; evaluation is most valuable as a signal the creator can request. **Current
reality:** evaluation still runs inline in the pipeline layer per S-01 for the types
in `EVALUATED_TYPES`.
