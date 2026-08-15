# Generalizing the Visualizer to produce HyperFrames

How the Visualizer stops emitting Remotion-flavored React and starts emitting
HyperFrames compositions — one implementation, no Remotion (per AGENT-GRAPH §2/§3).
Design only; the first scene was ported by hand in `hyperframes/self-attention/`.

Pairs with `AUDIO-SYNC-PROPOSAL.md` (the beat/anchor model) — this is where that
model and the render substrate meet.

## 0. How HyperFrames loads skills on demand (and why it matters here)

HyperFrames' authoring knowledge is a **router + lazy references + freshness**:
- **Eager core** (`/hyperframes`, the `hyperframes-*` domain skills, `/media-use`);
  **workflows lazy** (installed on route via `npx hyperframes skills update <name>`).
- **`/hyperframes` routes by intent** and loads only the one domain skill needed;
  each skill's `references/*.md` load per-need, not all at once.
- **Freshness** via `skills check/update`; a failed update is a hard tool failure
  ("do not continue from a remembered contract"). CI opt-out: `HYPERFRAMES_SKIP_SKILLS=1`.

**This is already Decode's department pattern** — `SKILL.md` + `instructions.md` +
`references/` loaded per-department. So the Visualizer authoring HyperFrames needs
no new mechanism: its **reference doc becomes the HF composition contract** (a
condensed `hyperframes-core`), loaded the same lazy way it loads `scene-api.md`.

## 1. Today's contract

`SceneModule{ beat_id, controls: SceneControl[], component_source: str }`:
- `component_source` — React/TSX importing **only** `@decode/animation-api`, handed
  `progress` (0→1), never a duration (the plan owns runtime; `total = Σ dur`).
- **Validation** (`visualizer/validation.py`) — a static **import-allowlist**: the
  scene may import nothing but `@decode/animation-api`, plus forbidden-API regexes.
  Load-bearing security gate: code that can't import can't do much.
- **Render** — Remotion (`@remotion/player` preview, `@remotion/renderer`).

## 2. Target contract

```
SceneModule{ beat_id, controls, composition_html, beats }
```

1. **`component_source` (React) → `composition_html` (HyperFrames)** — the scene is
   an HF composition: elements + styles + one paused `gsap.timeline` on
   `window.__timelines`, authored **duration-agnostic**.
2. **`beats: [{ name, anchor }]`** — named visual beats declaring *when* each
   animation fires as a `phrase`/`progress` **anchor** (`decode/timing.py`), never a
   hardcoded second. This is audio-sync slice 3, and the linchpin of §5.

## 3. The convergence (why the order was timing-first)

```
Visualizer emits   HF structure + beats[{name, anchor}]            (no seconds)
        │
Decode resolves    resolve_beats(anchors, narration) → { name: 3.42, … }   (timing.py)
        │
Decode assembles   GSAP tween offsets + data-start = resolved seconds,
                   stamps data-duration = measured narration (ADR-005)
        │
HyperFrames        deterministic render
```

The Visualizer never writes `3.42`; Decode injects it from the narration. Edit one
sentence → re-resolve → new offsets, nothing hand-fixed. The beat model, the
render substrate, and narration-as-timing-authority meet in this one step.

**Duration tension, resolved:** HF wants an absolute `data-duration`; Decode says a
scene never declares its length. Answer: the Visualizer authors the timeline
against anchors/progress (length-agnostic); **Decode stamps `data-duration` from
the measured narration** at assembly time. ADR-005 holds — the length still comes
from the audio, now injected rather than declared.

## 4. What changes, concretely

| Layer | From | To |
|---|---|---|
| Schema | `component_source` | `composition_html` + `beats` |
| Authoring knowledge | `references/scene-api.md` (React SDK) | a condensed `hyperframes-core` contract, loaded on demand |
| Validation | import-allowlist regex | **HyperFrames `lint`/`check`** — determinism bans (`Date.now`/`Math.random`/network), animatable-property allowlist, layout |
| Render / preview | `@remotion/player` + `@remotion/renderer` | `hyperframes preview` / `render` |

The **validation swap is the load-bearing security change**: our regex gate goes
away (HTML has no imports), replaced by HyperFrames' determinism linter. See §6.

## 5. Smallest generalization slice

Prove the **authoring contract** end-to-end on the fake + one scene, decoupled from
the frontend render swap:
1. Add `composition_html` + `beats` to `SceneModule` (alongside `component_source`
   for a migration window — not two *permanent* impls).
2. `FakeVisualizer` emits a valid HF composition + one anchored beat.
3. Gate it by running **`hyperframes lint --json`** (or `check`) on the emitted HTML.
4. Test: fake scene → resolve its beats against fixture narration → assemble a
   timeline with resolved offsets → `hyperframes check` passes.

This proves the whole seam in the backend without touching the frontend player.

## 6. Open decision — the validation gate

- **(a) Shell out to `hyperframes lint --json`** from the backend. Reuses the
  authoritative linter; adds a Node/HyperFrames-CLI dependency to the backend's
  path. **Recommended** — never maintain a drifting copy of someone's validator.
- **(b) Replicate HyperFrames' key determinism-lint rules in Python.** No CLI
  dependency; we own and must maintain a subset that will drift from theirs.

Lean **(a)**. It mirrors the provider-boundary pattern (`renderer.py`): the CLI is
a boundary Decode owns a port to, not a framework Decode absorbs.

## 7. Sequencing

1. This slice (§5) — the Visualizer→HF authoring contract on the fake.
2. Real Visualizer (OpenAI) emits `composition_html` — reuse the `OpenAIAgent`
   harness; swap the reference doc + the `draft→validate→repair` gate to
   `hyperframes lint`.
3. Frontend render swap — `DecodePlayer`/`render-video.ts` → HyperFrames runtime.
4. Retire the Remotion packages + the `@decode/animation-api` port.

Each is its own PR; the app keeps rendering (old scenes on Remotion) until step 4.

## Not in scope
Rewriting unrelated code. The orchestrator, project state/snapshot, narration
authority, and the beat model are untouched — this only changes what the Visualizer
*emits* and how that output is validated and rendered.
