# AGENT-GRAPH.md — Decode's orchestration model (proposal v1)

The move: **from a fixed department pipeline to an orchestrator running a graph
of specialist agents, each with a bounded tool set.** The side chat is the
orchestrator's surface; "scripting…" is the orchestrator naming the agent it
just dispatched.

This supersedes the staged departments in `PROJECT_CONTEXT.md` as the *execution*
model. It does **not** discard the product invariants in `MASTER.md` — several of
them become the orchestrator's job rather than the pipeline's.

---

## 1. What changes, what stays

**Replaced (department baggage):**
- The hardcoded `CHAIN` (`brief→plan→script→visuals→voice`) → the orchestrator
  decides the next agent from the goal + current project state.
- Rigid per-department `contracts.py` protocols → agent **tool schemas**.
- Stage-gating ceremony (`unlockLevel`, locked nudges) → the orchestrator gates
  on readiness and *says* what's missing.
- `auto_continue` / the Continuous ↔ Stage-by-stage toggle → gone. "Stage by
  stage" *is* the department gating; with no department boundaries there is
  nothing to gate. Its second job — a cost control ("don't auto-spend on the
  next stage until I approve") — is re-homed to propose-before-spend, not a
  global boolean (see §8).

**Kept (load-bearing, not departmental):**
- **History / undo of the content.** The project's edit history survives — but as
  a snapshot + checkpoints, not the per-artifact version DAG with latest/approved
  pointers (that's replaced; see §8).
- **Propose → Apply → Receipt.** A natural-language request never silently
  mutates; it returns a scoped proposal and runs on confirm, then posts a receipt.
- **Named progress, never a bare spinner.** Now the orchestrator's job: it shows
  "Scripting scene 3…", not "Thinking…".
- **Everything the room can do, a hand can do.** The tool registry *is* the hand
  controls — every tool maps to a store action or endpoint (§4).
- **Narration is the timing authority** (ADR-005). **Human directs**; the
  per-scene direction loop stays the core interaction.
- **Regeneration scope:** editing a scene marks only that scene stale; approvals
  never reset by a redraw.

---

## 2. The orchestrator (the side-chat brain)

One agent behind the docked chat. Its loop:

1. **Read** the user's intent and the working state (project, scenes, selection).
2. **Plan** which specialist(s) to invoke and in what order.
3. **Dispatch**, streaming a *named* status line per agent it runs.
4. **Collect** results into a scoped **proposal** (what changes / what stays).
5. **Apply** on the user's confirm; **post a receipt**.

Two responsibilities the orchestrator owns that the pipeline never did:

- **It holds the working context** (current scenes and their input versions), so a
  specialist tool gets its inputs *from the orchestrator*, not by re-deriving
  lineage from artifact parents. → directly removes review **finding 1** (the
  permanent 409 after a manual edit).
- **It always leaves an escape.** Any long op is cancellable and time-bounded; no
  dead-end "Redrawing…" with the UI locked. → removes review **findings 3 & 5**.

## 3. The specialist agents (graph nodes)

Mapped from the crew (`lib/crew.ts`). The count of *agents* ≠ the count of crew
names shown — granularity you can see is a product decision, granularity inside
is engineering.

| Agent | Presents as | Owns | Notes |
|---|---|---|---|
| Producer | Producer | Production brief from sources | |
| Director | Director | Teaching plan · beats | plan edits reset plan+script |
| Writer | Writer | Narration | rewrite marks voice stale |
| Storyboard | Motion Designer | *what* a scene shows | context-isolated from source |
| Renderer | Motion Designer | the component/HTML | never sees the source doc |
| Voice | (the Writer's output) | renders narration (Fish Audio) | a tool, not a reasoner |
| Editor | Editor | timeline craft, alignment, export | |
| Evaluator | — | judge a version | **optional tool, not a gate** |

## 4. Agent anatomy & memory — the canonical shape, mapped

The standard agent diagram (harness → ephemeral working memory → tool-call loop
→ guardrails → reply, fed by procedural / semantic / episodic memory with a
consolidation loop) is the right skeleton. Decode already implements its left
half; the memory tiers are the real addition — and they belong to the
**orchestrator only**, not to every agent.

**What every agent shares** (already built):

| Diagram box | Decode | Status |
|---|---|---|
| Harness (LangGraph/…) | `execution/` — pipeline · worker · context · dispatcher | ✅ durable, transactional, idempotent |
| Working Memory / Context RAM | `execution/context.py` `ContextAssembler` | ✅ ephemeral, bounded to immutable inputs |
| Procedural Memory (Skill.md) | department `SKILL.md` manifests + `instructions.md`; `SKILLS.system()` | ✅ this *is* procedural memory |
| Tool loop + end-loop guardrails | Visualizer `draft → validate → repair` (`MAX_TURNS=2`) + static gate | ✅ for visuals; generalize per tool |

**What only the orchestrator gets** — the memory tiers and the consolidation
loop. The specialists (Writer, Storyboard, Renderer, Voice) are **batch
producers**: they run once on a bounded input and emit one artifact, so episodic
chat memory and a summarizer loop is memory they never read. The orchestrator is
the one *conversational* agent, so it carries:

| Memory tier | Maps onto (existing durable store) | Access |
|---|---|---|
| Semantic (durable facts, taste) | `ProductionIntent` (audience/depth/brand) + brief `key_concepts` | assembler + optional top-k |
| Episodic (dated events, past chat) | artifact **version history** + SSE **event stream** + receipts (already SQL) | recency (SQL) + relevance (top-k) |
| Consolidation (distill → facts) | a cheap **Summarizer** run after N interactions | writes back to semantic |

So "add memory" is mostly *expose stores you already have through the working-
memory assembler*, not stand up a new vector DB. `context.py` already reserves
the seam ("semantic or episodic retrieval can be added behind this boundary
later").

**Harness stance (decided, not open):** keep Decode's durable substrate — LangChain
gives none of the outbox/idempotency/immutability guarantees you rely on, and
LangGraph's only real gift (graph orchestration) you can express in your own code
over that substrate. Keep **Pydantic** for tool schemas. Steal the graph
*pattern*, skip the dependency — the HyperFrames call, applied to agents.

**Why the consolidation loop earns its place:** distilling "the director keeps
asking for sparser visuals, physical metaphors" into semantic memory makes the
project *learn the director's taste*, which then shapes future scenes and sharpens
the per-scene direction loop (§5 `direct_scene`). It's the part worth building
first because it compounds the loop the product is built on.

## 5. The tool registry

Grouped by capability. **Every write tool returns a proposal first and posts a
receipt on apply.** Read tools need no proposal.

### Observe (read-only)
- `get_project_state()` — brief, plan, scenes, selection, stale flags
- `get_timeline()` — per clip: `id, start, end, dur, track, z_order`, plus gaps
  and overlaps between adjacent clips
- `get_scene(beat_id)` — spec, narration, controls, audio, stale
- `screenshot_scene(beat_id, at_progress)` — render a still for vision inspection
  *(needs a render env — see §6)*
- `check_alignment()` — clip gaps/overlaps, narration-vs-visual drift, beats out
  of teaching order
- `get_script()` · `get_plan()` · `get_brief()`

### Plan (Director) — resets plan + script
- `reorder_beats` · `cut_beat` · `add_beat` · `retime_beat`

### Script (Writer) — marks voice stale
- `rewrite_narration(beat_id, direction)`

### Visual (Storyboard + Renderer) — scene-scoped, marks that scene stale
- `direct_scene(beat_id, direction)` — **BUILT** (`regenerate_scene_visual`)
- `regenerate_visual(beat_id)` · `set_control(beat_id, name, value)`

### Voice
- `record_narration(beat_id | all)`

### Edit (Editor) — scene ops, reset nothing
- `split_scene` · `merge_scenes` · `duplicate_scene` · `delete_scene`
- `retime_scene` · `set_fade` · `set_track` / `set_z_order` · `set_start`
  (free placement)

### Publish (Editor)
- `render_export(format)`

Each row maps to an existing store action (`splitScene`, `mergeScene`,
`nudgeDur`, `setClipFade`, `reorder`, `applyRegen`, `pickVisual`,
`setControlValue`, …) or an endpoint. That mapping is the testable form of
"everything the room can do, a hand can do".

## 6. The two tools you called out

- **`screenshot_scene`** renders a scene at a progress point and hands the image
  back for inspection — the vision loop. It's what lets the Storyboard agent (or
  the orchestrator) say "the fog should be thicker near the summit" and redraw,
  instead of shipping blind.
- **`get_timeline` / `check_alignment`** expose the cut's *geometry*: each clip's
  start and end (derived from placement + measured duration, never stored), which
  track it sits on, what's stacked above or below it (`z_order`), and any gap or
  overlap — between two adjacent clips, or between a clip and the narration it
  should land with. This is how the Editor agent reasons about "clip B starts
  before clip A's line finishes."

## 7. Review findings, mapped to the design

The `/code-review` on the Phase 3 diff found seams the pivot mostly closes:

| # | Finding | Disposition |
|---|---|---|
| 1 | Direct-scene 409s forever after a manual scene edit (lineage roles absent) | **Unreachable** — `EDITABLE` is brief + script only, so scene_visuals can't be manually edited; every version carries the generation roles. Fails safe even in the impossible case. |
| 2 | `regenerate_one` republishes an identical version when the beat has no prior module (merge is replace-only) | ✅ **Fixed** — insert-or-replace in both real + fake Visualizer; regression test added. |
| 3 | Unbounded poll loop → stuck "Redrawing…" | ✅ **Fixed** — bounded ~3-min poll, fails safe. |
| 4 | `directScene` snaps selection back to the directed scene | ✅ **Fixed** — restores the live selection, respecting mid-redraw navigation. |
| 5 | auto_continue removes the manual advance if the chain stalls | Open — low probability (CHAIN always carries inputs); revisit with the orchestrator, which always leaves a way forward. |
| 6 | Fallback-refresh timer churns every render | Open — perf nit; the SSE `onEvent` refresh is the real driver, the timer is only a backup. |

## 8. State model — a snapshot + checkpoints, not versioned artifacts

The department pipeline stored five immutable artifact types, each with its own
version chain, `latest`/`approved` pointers, and a cross-artifact lineage DAG.
That machinery served **staged, independently-approved handoffs** — the model
we're leaving. The orchestrator wants one thing to edit.

**Target: one project snapshot + a checkpoint history.**
- The snapshot is the whole editable project: sources → intent → beats →
  per-beat narration → per-scene component + controls → timeline placement.
  Brief / plan / script stop being separate artifacts and become *sections* of it.
- Every agent tool-call and every human edit writes a **checkpoint** — the
  document-level replacement for per-artifact versions. Undo/revert is "go to an
  earlier checkpoint", which is what an editing canvas wants anyway.

**Frame rendering is a different layer.** Remotion renders frames from a snapshot
of the current scenes (`inputProps` at export). It never removes the need to
*store* the scenes — the render snapshot is derived from the project state, not a
replacement for it. "We render frame-by-frame" is not a reason to drop state.

**Keep — at the document level rather than per-artifact:**
- **History / undo.** The human-director thesis is "direct a scene, revert if you
  don't like it." A bare mutable blob loses that; checkpoints keep it.
- **Atomic, idempotent apply.** Agent generations are expensive and
  non-deterministic; a retry must not duplicate and a crash must not corrupt.
  Keep idempotency keys + atomic writes, applied to "apply tool result +
  checkpoint" instead of "publish artifact version".

**Drop:** per-artifact version chains, `approved`/`latest` pointers, cross-artifact
lineage, staged approval gates, and the `auto_continue` flag / Continuous toggle
that drove them (Phase 2 already began this). The "don't auto-spend" intent
`auto_continue=false` carried becomes the orchestrator's propose-before-spend
step, not a global boolean.

**Migration note:** the artifact system is woven deep — the Postgres immutability
trigger, `publish_version`, the worker's publish path, lineage queries. This is a
sizable migration sequenced as part of the pivot, not a quick delete, and it
happens *after* the current shipped work is committed.

## 9. Open decisions

1. **Orchestrator runtime** — a durable backend LLM tool-loop (streamable, one
   place to enforce propose/apply) **[recommended]**, or a thin frontend
   dispatcher over today's endpoints.
2. **Graph shape** — fully dynamic (orchestrator picks every edge), or a declared
   default graph = today's teaching order that it may branch from **[recommended:
   keeps the pedagogy the default]**.
3. **State model** — settled (§8): snapshot + checkpoints replaces versioned
   artifacts. The evaluator becomes an optional tool, not a gate.
4. **Vision infra** — `screenshot_scene` needs Node/Remotion render + per-call
   cost; shared with the vision-loop backlog item.

## 10. Settled from the current-setup review

Checked against the code and confirmed, so the migration builds on them:

- **What's user-provided vs generated.** `source` (upload) and `production_intent`
  (audience / depth / brief choices) are the creator's — never generated.
  Everything downstream — brief → teaching_plan → script → scene_visuals → voice —
  is auto-generated *and* auto-approved (today via `continue_chain`, recording a
  real `ApprovalDecision` under `decode:auto-continue`). In the snapshot model the
  intent + sources are the inputs; the rest are sections the agents fill.
- **Dependencies stay deterministic — do NOT hand them to the LLM.** The agent
  decides *content*; the system records *what fed what* (today `parents = a job's
  inputs`, set by the worker). Staleness — "what must regenerate when scene 5
  changes" — is the whole reason the graph exists; if an LLM owns it, staleness
  becomes unreliable and the "only regenerate downstream" guarantee breaks. Keep
  content-decisions and dependency-tracking separate.
- **Evaluation is an optional hook, not a per-stage gate.** Today it runs inline
  after brief + plan only (`EVALUATED_TYPES`); script / visuals / voice aren't
  evaluated. Target: evaluation becomes a tool the orchestrator can call (often at
  the end, not every stage), plus per-tool validation hooks that extend the
  pattern the Visualizer already has (`validate_scenes` + repair).
- **One store, not a table per department.** Keep a single snapshot document with
  per-scene sections; binary media (audio, later SFX/music) lives in the object
  store with a small **asset table** for reuse/caching. N per-department tables
  would fragment the one thing the migration unifies.
- **`ArtifactVersion` → checkpoints/diffs**, `latest`/`approved` pointers and the
  lineage DAG retire — see §8.
- **`auto_continue`** — UI removed; the column retires in the §8 migration.
- **Department gerund renames** (initiating / architecting / writing / visualising)
  are cosmetic and optional — note `author` (writing) and `visualizer`
  (visualising) are two departments, and `voice` presents as the Writer, not its
  own role.
- **New tools are net-new.** Only `intake` declares a tool today (`record_finding`);
  `screenshot` / `check` / `alignment` (§4, §6, and the audio work) don't exist yet.
- **The "Visualizer" role is the Motion Designer.** The responsibility is naming
  *how* a beat's teaching intent becomes animated, positioned, and synced to
  narration — Decode decides *what visual teaches*; the Motion Designer turns that
  into motion; HyperFrames renders it. This is established in the department's
  identity (SKILL.md / instructions) and docs. The persisted names stay put —
  `scene_visuals` (artifact/output), `generate_scene_visuals` / `regenerate_scene_visual`
  (job kinds), `DECODE_VISUALIZER` (provider), and the `visualizer/…` provenance
  identifier are the contract, not the role, so renaming them would be a data/config
  migration for no gain. Internal code symbols (`OpenAIVisualizer`, the `Visualizer`
  protocol, the folder) may be renamed later as a cosmetic pass, or left.
   **Storyboard Artist** ("what should appear") is a *future* split — today the
   Motion Designer also carries it, seeded by the plan's `visual_opportunity`.

## 11. Compatibility slice shipped

The first durable graph slice runs inside the current artifact model rather than
waiting for the snapshot migration in §8:

- `generate_scene_visuals` creates one durable `design_scene` task per plan beat.
  Those tasks are immediately ready and ARQ may execute up to the worker's
  configured concurrency limit in parallel.
- A successful `design_scene` task is a durable candidate, not an applied scene.
  Edit reads candidates from `GET /jobs/{job_id}/scene-candidates`, previews the
  real Remotion source, and accepts the exact source the creator reviewed through
  the idempotent candidate-acceptance endpoint. A direction may change that source
  before acceptance; every other candidate remains untouched.
- One `assemble_scene_visuals` task depends on every scene task. It becomes ready
  only after every prerequisite succeeds **and is explicitly accepted**, validates
  the complete ordered set, and publishes the existing immutable `scene_visuals`
  artifact exactly once. Migration `0006` treats scene tasks completed under the
  previous auto-assembly policy as already accepted.
- Task attempts carry an attempt token, so an old queue delivery cannot complete a
  newer retry. Replacing the parent run makes every task from the old run stale.
- A failed scene retries independently. Completed sibling scenes remain durable
  task outputs and are not regenerated.
- Cancellation marks the parent Job/Run and every unfinished task cancelled in one
  transaction. Provider calls hold no database transaction; a result that returns
  after cancellation is discarded by the completion check.
- Task priorities flow through the transactional outbox. Task lifecycle events use
  `production.graph.started`, `production.task.*`, and
  `production.scene.candidate.{ready,accepted}`. `GET /jobs/{job_id}` includes the
  current task projections and their acceptance timestamps.

This is deliberately not the §8 state migration. Existing lineage, approvals,
studio projections, and downstream voice generation continue to consume the same
whole artifact while the graph execution semantics prove out underneath them.
