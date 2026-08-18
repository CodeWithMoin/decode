# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this repository is

A monorepo for **Decode** — an AI-native production studio that turns technical
source material into educational videos the user directs, scene by scene. The
project is the primary artifact; a video is one export from it.

```
apps/frontend/              Next.js 15 · React 19 · Tailwind v4 · Zustand · GSAP · Motion
apps/backend/               FastAPI modular monolith · SQLAlchemy 2 · Alembic · ARQ
compose.yaml                local Postgres 16 + Redis 7
Makefile                    every task runs from here
design_handoff_decode_studio/   the original design bundle (see below)
packages/shared-types/      empty placeholder
```

## Commands

```bash
make setup     # deps + .env files
make dev       # infra + migrate + api, dispatcher, worker, frontend
make test      # pytest, eslint, tsc --noEmit
make check     # + ruff, mypy, next build
make help
```

Studio at <http://localhost:3000/studio>, API docs at <http://localhost:8000/docs>.
There is no test runner on the frontend — `make test` typechecks and lints it only.

## Read these before changing anything

| File | What it is |
|---|---|
| **`MASTER.md`** | **Authoritative.** Design system + product invariants. Every hex, size, radius and duration is a decided value. Its machine-readable form is `apps/frontend/src/app/globals.css`; the two must never disagree. |
| `docs/PROJECT_CONTEXT.md` | Vision and the eight backend departments. The "why". |
| `docs/APP-STRUCTURE.md` | Frontend map. Partially stale — see "Known drift". |
| `docs/CREATOR-LANGUAGE.md` | Internal term → creator-facing language. "Agent", "artifact", "job" are not user-facing words. |
| `docs/LANDING-PLAN.md` | Landing page composition, as built. |
| `docs/HYPERFRAMES-ARCHITECTURE-REVIEW.md` | Decision: adopt HyperFrames as a replaceable render substrate behind a Decode-owned port, never as the framework. Migration has begun (one scene ported); `docs/VISUALIZER-TO-HYPERFRAMES.md` is the live plan. |
| `.omc/autopilot/spec.md` + `.omc/plans/` | The approved walking-skeleton contract. |

**The planned pivot.** Three design docs describe where the execution model is
going — they are proposals, not shipped: `docs/AGENT-GRAPH.md` (authoritative on the
orchestrator + graph-of-agents model and its §10 settled decisions; supersedes the
staged departments as the *execution* model), `docs/VISUALIZER-TO-HYPERFRAMES.md` (the
Motion Designer's Remotion-flavored output generalized onto HyperFrames), and
`docs/AUDIO-SYNC-PROPOSAL.md` (the Sound Designer department + full beat-sync system).
None of the orchestrator, snapshot/checkpoint state model, HyperFrames
generalization, or Sound Designer is built yet — today's reality is still the
department pipeline + immutable artifacts + Remotion under the hood, with the
single-workspace UI on top.

Where `MASTER.md` and any other document conflict, `MASTER.md` wins.

## The seam that matters most: two frontends

`apps/frontend/src` contains two parallel applications. Know which one you are in
before you edit.

| | Prototype | Connected |
|---|---|---|
| Entry | `/` → `components/Studio.tsx` | `/studio/*` App Router pages |
| Navigation | `useStudio.screen` switch | real URLs |
| Data | `lib/api.ts` — seeded, synchronous | `lib/decode-api.ts` — fetch + SSE |
| Project screen | `project/ProjectShell.tsx`, four seeded stages | `connected/ConnectedProjectFrame.tsx`, single Edit workspace |

`Dashboard` and `NewDecode` serve both through a `connected` prop. Connected Edit
adapts durable artifacts into the prototype workstation. Everything else belongs to
one side. The prototype is the full product, faked; the connected app is the real
vertical slice. New backend-backed work goes on the connected side.

**Single workspace shipped (connected side).** A new project runs inputs → a named
build screen → **Edit** automatically; there is no staged wizard the creator clicks
through. Understanding / Teaching Plan / Script are **removed from nav** — reachable
by deep-link only — and plan + script are **tabs in the Edit inspector**, not
separate stage routes. The staged flow below (`unlockLevel`, locked nudges, the
Continuous ↔ Stage-by-stage toggle) is the prototype's model and the backend
department pipeline; the connected UI no longer surfaces it. `docs/AGENT-GRAPH.md`
describes the planned orchestrator that replaces the pipeline entirely.

### Frontend seams (prototype side)

```
lib/types.ts    the shapes. Nothing else defines one.
lib/api.ts      the only module that produces seeded data.
store/studio.ts all mutable state + every action.
components/*    render state, call actions, compute nothing durable.
lib/derive.ts   timing · gating · acts · pacing · easing — called at render, never stored.
```

Nothing derived is ever written back to the store.

## Architectural invariants

Load-bearing product decisions, not styling preferences.

**The crew.** Five specialists in `lib/crew.ts` — Producer (Understanding),
Director (Teaching Plan), Writer (Script), Motion Designer (Edit · visuals),
Editor (Edit · publishing). One source drives rail marks, handoff cards, receipts and
scene notes. Never label the AI "Assistant" or "AI". Crew identity belongs to the
work — handoffs, proposals, receipts — not to global chrome; the Production room
speaks as Decode, not as one all-purpose Producer. All generated copy is first
person, past tense for finished work, and always states *why*.

**Timing outputs are derived.** A scene stores duration and may store an explicit
timeline start and video track after a free drag. Scenes without explicit
placement use the gapless cumulative fallback. Runtime is the furthest enabled
clip end; playhead lookup, timecodes and word timings derive from placement and
duration. There is no sync step and there must never be one. Narration is the
timing authority (ADR-005), now extended to *sub-scene* events: `decode/timing.py`
(`NarrationTiming` with per-word timestamps, semantic `Anchor`s resolving to
seconds) lets a beat's internal moments land on the words that name them —
narration clips carry `words`. Built and tested.

**Stage gating** *(current; prototype + backend pipeline — the connected UI no
longer surfaces stages, and `docs/AGENT-GRAPH.md` replaces gating with an orchestrator
that gates on readiness and says what's missing).* `unlockLevel()`: `script → 5`,
`plan → 2`, `understanding → 1`, else `0`. Nav levels: overview 0, plan 1, script 2,
edit 5. Export is an Edit action, not a stage. A locked stage calls `lockedNudge()`
— the Production room opens and explains. Never a tooltip. Approving advances the
tab.

**Re-approval asymmetry.** Plan-level edits (reorder, cut, add a beat) reset
`plan` *and* `script`. Scene-level operations in Edit (split, merge, duplicate,
retime, narration text) reset nothing.

**Regeneration scope (settled).** Approvals never reset. Editing a scene marks
that scene's visual spec, assets and voice **stale** — nothing outside it — and
rebuilds none of it until the user asks. Stale uses `--color-stale*`, deliberately
not the error ramp: it is the expected result of an edit, not a fault.

**Script writes, Timeline navigates.** Narration is editable in exactly one place,
in place — the Script surface (its own stage in the prototype, the Script tab of the
Edit inspector on the connected side). The Timeline links back to it. Never two
editable copies of the same text.

**Everything the room can do, a hand can do.** Nothing the chat can act on may
exist without a direct control that does the same thing. This used to be enforced
by the ⌘K palette *being* the control list; the palette is gone, because Edit grew
real controls — a timeline toolbar for split, merge, duplicate, add, delete and
reorder, an Inspector for naming, retiming and the three regenerate scopes, a
transport for play and seek. The guarantee now sits on the chat's tool registry:
every tool the model may call maps to a store action, which is a list a test can
assert rather than a convention someone must remember.

**A natural-language request never silently mutates the project.** It returns a
proposal naming what changes and what stays, and only runs on **Apply change**.
Every applied change posts a receipt. ⌘J focuses the composer — the room is a
docked column and is always open, so the shortcut puts your cursor in it rather
than opening it.

**One owner per piece of state, and sync runs one direction at a time.** Every
"Maximum update depth exceeded" in this codebase has been the same bug: something
external holds its own copy of state the store also owns, and the two were wired
together with two-way sync and a float tolerance. The Remotion player counts
integer frames while the store keeps seconds, so `seekTo` → `frameupdate` →
`seek` → `seekTo` never converges no matter how tight the tolerance. The fix is
never a smaller epsilon. Decide which side owns the value *at this moment* —
while playing the player drives and the store follows, while paused the reverse —
and compare in the integer unit, not the float one. `react-hooks/set-state-in-effect`
is on as a warning and exists to catch this; do not switch it off again.

**Nothing is a bare loading state.** No unexplained spinner, no "Generating…", no
"Thinking…". Progress is a named checklist with per-step detail lines.

**The crew can disagree** *(intended, not currently wired).* The design calls for
scenes where the crew offers two options with a stated preference; picking one
collapses to a teal confirmation and posts a receipt. The prototype's
`SCENE_NOTES` / `SpecialistNote` implementation was removed as dead code (no
consumer) — rebuild it on the connected side when the direction loop surfaces
alternatives, rather than reviving the seeded version.

**No entrance animations inside the studio.** Elements render at settled state, so
nothing is invisible if a timeline never advances. Scroll motion is landing-only
and authors no hidden state in CSS. Respect `prefers-reduced-motion`.

**Responsive without media queries.** `repeat(auto-fit, minmax(Xpx, 1fr))` and
`clamp()` throughout. Verify at 375 / 768 / 1024 / 1440.

**A novice can drive it, and that outranks taste.** One name per object; exactly
one obvious primary action per screen; no dead ends. No cutting-room vocabulary in
rendered copy.

## Backend invariants

The version/lineage invariants below are the **current** state model. `docs/AGENT-GRAPH.md`
§8 plans to replace per-artifact version chains with one project snapshot + a
checkpoint history — designed, not built. The atomic-idempotent-apply and history
guarantees carry over; treat these as load-bearing until that migration lands.

- **Artifact versions are immutable** — enforced by a Postgres trigger, not just
  by code. Publish a new version; never mutate one.
- **Latest and approved are distinct pointers** on the artifact.
- **Every mutation requires `Idempotency-Key`.** Same key + different body → 409.
  Replays return the stored response.
- **Transactional outbox → ARQ**, at-least-once with a stable `_job_id`. The worker
  re-checks `job.active_run_id` and returns `stale_run` rather than publishing.
- **Source uploads are lease-owned per attempt.** A stale uploader must never
  overwrite or delete its successor's object.
- **Actor identity comes from server config**, never from a command body.
- **CORS is not authentication.** Production refuses to start without
  `DECODE_TRUSTED_ACCESS_BOUNDARY_CONFIRMED=true`.
- The Producer and Evaluator are **deterministic fakes** that label themselves
  (`source_findings.fixture: true`). Never claim extraction or citations the
  backend did not perform — the UI reads that flag and says "sample brief".
- **The "Visualizer" department's role is the Motion Designer** — how a beat's
  teaching intent becomes animated, positioned and synced to narration (Decode
  decides *what visual teaches*; the Motion Designer turns it into motion;
  HyperFrames renders it). The role name is not the contract: the persisted names
  stay put — `scene_visuals` (artifact type), `generate_scene_visuals` /
  `regenerate_scene_visual` (job kinds), `DECODE_VISUALIZER` (provider),
  `visualizer/<v>` (provenance id) and the `visualizer/` department folder.
  Renaming them would be a data/config migration for no gain; don't "fix" them.
- `providers/renderer.py` is a boundary only, and the Motion Designer still emits
  Remotion-flavored React that the frontend preview plays via `@remotion/player`.
  One HyperFrames scene is ported by hand (`hyperframes/self-attention/`); the full
  generalization is planned, not built — see `docs/VISUALIZER-TO-HYPERFRAMES.md`.

## Traps — regressions with a history

Re-introducing one of these is a regression, not a preference.

- **Never name a colour token `base`** — Tailwind v4 would generate a `text-base`
  colour utility shadowing the built-in font size.
- **Base resets go in `@layer base`, primitives in `@layer components`.** Unlayered
  CSS beats every layered utility regardless of specificity.
- **Quantize anything derived from `sin`/`cos`/`pow` before it reaches the DOM**
  (`q6`, `toFixed`). Node and browser libm differ in the last ULP and React reports
  a hydration mismatch.
- **The Edit canvas footer is a flex sibling**, never absolutely positioned. Canvas
  chips are `flex:0 1 auto; min-width:0` with ellipsis.
- **The Production room is opaque** (`#FCFCFB`) and above the sticky header.
- **The Understanding "Audience" stat is user free text** — step the size down at
  16 and 26 characters, never line-clamp.
- **Concept pills are `white-space: nowrap`** and must never break mid-label.
- **Diagram surfaces are not chip surfaces.** Scene visuals use `#232323`/`#484848`;
  `#1C1C1C` on `#0B0B0B` is intentionally quiet and adjacent diagram shapes
  still need the brighter pair to remain distinct.
- **The hero is one cinematic stage** — no floating cards layered over it.
- **Use `--header-h`**, never a hardcoded `top-[57px]`.

## Known drift

Fix opportunistically; do not treat as intended.

- `docs/APP-STRUCTURE.md` remains a prototype-oriented map and does not fully document
  `components/app/*`, `components/connected/*`, `lib/decode-api.ts` or
  `lib/creator-errors.ts`.
- `ConnectedProject` re-declares its stage list, rail and header instead of reusing
  `ProjectShell` / `RailFrame` / `StudioNav`. This is the duplication that will hurt
  when Teaching Plan is connected.
- `WORKFLOW_STEPS` in `lib/api.ts` has no consumer.
- `Dashboard.projectToCard` hardcodes `const stage = "Understanding"`.
- `GET /projects` runs three queries per project in a loop, and the Dashboard then
  fetches `getStudio` per project. Fine at 3, N+1 at 300.
- `packages/shared-types/` is empty.
- No stage navigation below 1024px in the prototype shell is a deliberate open
  question, not an oversight — see `MASTER.md`.

## The design handoff bundle

`design_handoff_decode_studio/` is the original design reference, kept for
provenance. It is **superseded** by the shipped code and by `MASTER.md`: it uses a
teal accent and six crew roles, both since changed. `support.js` is a design-tool
template runtime — do not port it, do not import from it. The eight scenes of real
"Attention Is All You Need" teaching copy in its `constructor` already live
verbatim in `apps/frontend/src/lib/api.ts`; use that copy, it is not lorem.
