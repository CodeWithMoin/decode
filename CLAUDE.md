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
| `PROJECT_CONTEXT.md` | Vision and the eight backend departments. The "why". |
| `APP-STRUCTURE.md` | Frontend map. Partially stale — see "Known drift". |
| `CREATOR-LANGUAGE.md` | Internal term → creator-facing language. "Agent", "artifact", "job" are not user-facing words. |
| `LANDING-PLAN.md` | Landing page composition, as built. |
| `HYPERFRAMES-ARCHITECTURE-REVIEW.md` | Decision: adopt HyperFrames as a replaceable render substrate behind a Decode-owned port, never as the framework. No adapter exists yet. |
| `.omc/autopilot/spec.md` + `.omc/plans/` | The approved walking-skeleton contract. |

Where `MASTER.md` and any other document conflict, `MASTER.md` wins.

## The seam that matters most: two frontends

`apps/frontend/src` contains two parallel applications. Know which one you are in
before you edit.

| | Prototype | Connected |
|---|---|---|
| Entry | `/` → `components/Studio.tsx` | `/studio/*` App Router pages |
| Navigation | `useStudio.screen` switch | real URLs |
| Data | `lib/api.ts` — seeded, synchronous | `lib/decode-api.ts` — fetch + SSE |
| Project screen | `project/ProjectShell.tsx`, five live stages | `connected/ConnectedProject.tsx`, Understanding only |

`Dashboard` and `NewDecode` serve both through a `connected` prop. Everything else
belongs to one side. The prototype is the full product, faked; the connected app is
the real vertical slice. New backend-backed work goes on the connected side.

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
Editor (Edit · Export). One source drives rail marks, handoff cards, receipts and
scene notes. Never label the AI "Assistant" or "AI". Crew identity belongs to the
work — handoffs, proposals, receipts — not to global chrome; the Production room
speaks as Decode, not as one all-purpose Producer. All generated copy is first
person, past tense for finished work, and always states *why*.

**All timing is derived.** `total = Σ dur`; `starts[i] = Σ dur[0..i-1]`; word
timings distribute a scene's duration evenly across its tokens. Reordering or
retiming recomputes the header, arc bar, timecodes, transcript and timeline on
their own. There is no sync step and there must never be one. Get this right
before touching the timeline.

**Stage gating.** `unlockLevel()`: `script → 5`, `plan → 2`, `understanding → 1`,
else `0`. Nav levels: overview 0, plan 1, script 2, edit 5, export 5. A locked
stage calls `lockedNudge()` — the Production room opens and explains. Never a
tooltip. Approving advances the tab.

**Re-approval asymmetry.** Plan-level edits (reorder, cut, add a beat) reset
`plan` *and* `script`. Scene-level operations in Edit (split, merge, duplicate,
retime, narration text) reset nothing.

**Regeneration scope (settled).** Approvals never reset. Editing a scene marks
that scene's visual spec, assets and voice **stale** — nothing outside it — and
rebuilds none of it until the user asks. Stale uses `--color-stale*`, deliberately
not the error ramp: it is the expected result of an edit, not a fault.

**Script writes, Timeline navigates.** Narration is editable in exactly one place,
the Script stage, in place. Edit links back to Script. Never two editable copies of
the same text.

**⌘K does, ⌘J discusses.** The command palette is the control list, so nothing can
appear in it that is not already a real action on the store. A natural-language
request never silently mutates the project — it returns a proposal naming what
changes and what stays, and only runs on **Apply change**. Every applied change
posts a receipt.

**Nothing is a bare loading state.** No unexplained spinner, no "Generating…", no
"Thinking…". Progress is a named checklist with per-step detail lines.

**The crew can disagree.** Scenes 3 and 5 offer two options with a stated
preference (`SCENE_NOTES`). Picking one collapses to a teal confirmation and posts
a receipt.

**No entrance animations inside the studio.** Elements render at settled state, so
nothing is invisible if a timeline never advances. Scroll motion is landing-only
and authors no hidden state in CSS. Respect `prefers-reduced-motion`.

**Responsive without media queries.** `repeat(auto-fit, minmax(Xpx, 1fr))` and
`clamp()` throughout. Verify at 375 / 768 / 1024 / 1440.

**A novice can drive it, and that outranks taste.** One name per object; exactly
one obvious primary action per screen; no dead ends. No cutting-room vocabulary in
rendered copy.

## Backend invariants

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
- `providers/renderer.py` is a boundary only. No HyperFrames adapter exists.

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
- **Diagram surfaces are not chip surfaces.** Scene visuals use `#212129`/`#3C3C48`;
  `#1D1D22` on `#0E0E10` is ~1.1:1 and adjacent shapes collapse into one slab.
- **The hero is one cinematic stage** — no floating cards layered over it.
- **Use `--header-h`**, never a hardcoded `top-[57px]`.

## Known drift

Fix opportunistically; do not treat as intended.

- `APP-STRUCTURE.md` lists an Assets stage, `app/preview/`, an Inspector Transcript
  tab and six crew members. None exist. It omits `CommandPalette`, `components/app/*`,
  `components/connected/*`, `lib/decode-api.ts` and `lib/creator-errors.ts`.
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
