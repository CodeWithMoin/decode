# Generalizing the Visualizer to produce HyperFrames

How the Visualizer stops emitting Remotion-flavored React and starts emitting
HyperFrames compositions — one implementation, no Remotion (per AGENT-GRAPH §2/§3).
Design only; the first scene was ported by hand in `hyperframes/self-attention/`.

Pairs with `AUDIO-SYNC-PROPOSAL.md` (the beat/anchor model) — this is where that
model and the render substrate meet.

## The one principle everything else serves

> **Decode owns semantic intent and timing. HyperFrames owns executable
> composition and rendering.**

Corollaries, load-bearing:
- The Visualizer never calculates an absolute second. It says *what* happens and
  *which anchor* it attaches to; Decode resolves *when*; HyperFrames renders.
- Decode's **domain model stays abstract** — `VisualBeat`, `AnimationEvent`,
  `TimingAnchor`, `Composition`. GSAP is a HyperFrames implementation detail and
  must not appear in Decode's schemas or backend logic (HyperFrames also drives
  WAAPI / TypeGPU; today's GSAP is one adapter, not the model).
- Decode emits **resolved timing metadata**, not animation-runtime instructions.
  It hands HyperFrames `{beat, start, duration}`; the composition consumes it.

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
   animation fires as an **anchor** (`decode/timing.py`), never a hardcoded second.
   Audio-sync slice 3, and the linchpin of §5.

   **The anchor type is an extensible enum**, designed so adding a kind never
   redesigns the system. Ship a few now, leave room:

   ```python
   BeatAnchor:
       type: Literal["phrase", "progress", "scene_start", "scene_end",
                     "after_phrase", "before_phrase"]   # grows over time
       value: ...        # phrase text, a 0..1 fraction, or a phrase ref
       offset_ms: int = 0  # "300ms after X", "hold until end"
   ```

   `phrase` + `progress` exist today; `scene_start/end`, `after/before_phrase`,
   and the `offset_ms` shift are the near-future kinds the resolver adds without
   touching callers.

## 3. The convergence (why the order was timing-first)

```
Visualizer emits   HF structure + beats[{name, anchor}]            (no seconds)
        │
Decode resolves    resolve_beats(anchors, narration) → { name: 3.42, … }   (timing.py)
        │
Decode emits       resolved TIMING METADATA:  [{beat:"trophy_reveal", start:3.42, duration:0.6}, …]
                   + data-duration = measured narration
        │
HyperFrames        the composition consumes the metadata; the runtime (GSAP today,
                   WAAPI/TypeGPU tomorrow) renders deterministically
```

The Visualizer never writes `3.42`; Decode injects it from the narration. Edit one
sentence → re-resolve → new metadata, nothing hand-fixed. Crucially **Decode stops
at timing metadata** — it does *not* assemble GSAP tweens or touch animation-runtime
internals. It says `{beat, start, duration}`; the HyperFrames composition (and its
chosen runtime) turns that into motion. That keeps Decode out of the
GSAP-manipulation business and portable across HF's runtimes.

**Invariant — scene duration comes from narration:**

> A scene's production duration is **derived from its narration artifact**, never
> chosen independently by the Visualizer.

HF requires `data-duration` and treats it as the governing length (not the GSAP
timeline length). Decode stamps it from the measured narration (ADR-005): narration
`17.4s` → `data-duration="17.4"`. The length still comes from the audio — now
injected rather than declared.

## 4. What changes, concretely

| Layer | From | To |
|---|---|---|
| Schema | `component_source` | `composition_html` + `beats` |
| Authoring knowledge | `references/scene-api.md` (React SDK) | a condensed `hyperframes-core` contract, loaded on demand |
| Validation | import-allowlist regex | **HyperFrames `lint`/`check`** — determinism bans (`Date.now`/`Math.random`/network), animatable-property allowlist, layout |
| Render / preview | `@remotion/player` + `@remotion/renderer` | `hyperframes preview` / `render` |

**Two separate boundaries — do not conflate them (§6):**
- **Composition validity** — is this a well-formed, deterministic composition?
  HyperFrames `lint`/`check` owns this (no `Date.now`/`Math.random`, no async
  timeline build, no infinite repeats, animatable-property allowlist, layout).
- **Execution security** — is it safe to *run* generated HTML? A different threat
  model than React imports: external network, arbitrary `<script>`, filesystem,
  untrusted URLs, iframes, resource exhaustion, runaway computation. `lint`
  passing does **not** imply this. Decode owns it via a **sandboxed render
  environment**; the old import-allowlist was a security boundary and its
  replacement must be a real sandbox, not the linter. Verify HyperFrames' render
  isolation before relying on it.

## 5. Smallest generalization slice

Prove the **authoring contract** end-to-end on the fake + one scene, decoupled from
the frontend render swap:
1. Add `composition_html` + `beats` to `SceneModule` (alongside `component_source`
   for a migration window — not two *permanent* impls).
2. `FakeVisualizer` emits a valid HF composition + one anchored beat.
3. Gate **composition validity** with `hyperframes lint --json` (or `check`) on
   the emitted HTML — determinism/layout, not security (§4).
4. Test: fake scene → resolve its beats against fixture narration → produce
   `{beat, start, duration}` timing metadata + stamped `data-duration` → the
   composition consumes it → `hyperframes check` passes.

This proves the whole seam in the backend without touching the frontend player.

## 6. Open decision — the composition-validity gate

*(This is validity only; execution security is the sandbox in §4, a separate
concern.)*

- **(a) Shell out to `hyperframes lint --json`** from the backend. Reuses the
  authoritative linter; adds a Node/HyperFrames-CLI dependency to the backend's
  path. **Recommended** — never maintain a drifting copy of someone's validator.
- **(b) Replicate HyperFrames' key determinism-lint rules in Python.** No CLI
  dependency; we own and must maintain a subset that will drift from theirs.

Lean **(a)**. It mirrors the provider-boundary pattern (`renderer.py`): the CLI is
a boundary Decode owns a port to, not a framework Decode absorbs.

## 7. Acceptance — visual regression, not just "does it lint"

We're migrating an *existing* renderer, so the bar is behavioral parity, not merely
a passing composition. For each representative scene:

```
Remotion render → reference frames
HyperFrames render → compare  →  visual diff · timing diff · duration diff
```

Use `hyperframes snapshot` at scene midpoints + an SSIM diff against the Remotion
baseline (the `remotion-to-hyperframes` eval harness). **"Looks and behaves like
the Remotion version" is migration acceptance criteria**, alongside a clean lint.
(The self-attention scene rendered deterministically; its SSIM baseline is still
unwired — see `hyperframes/self-attention/TRANSLATION_NOTES.md`.)

## 8. Sequencing

1. This slice (§5) — the Visualizer→HF authoring contract on the fake.
2. Real Visualizer (OpenAI) emits `composition_html` — reuse the `OpenAIAgent`
   harness; swap the reference doc + the `draft→validate→repair` gate to
   `hyperframes lint`, and run generated HTML inside the **sandbox** (§4).
3. Frontend render swap — `DecodePlayer`/`render-video.ts` → HyperFrames runtime,
   gated by the §7 visual-regression check per migrated scene.
4. Retire the Remotion packages + the `@decode/animation-api` port.

Each is its own PR; the app keeps rendering (old scenes on Remotion) until step 4.

## Not in scope
Rewriting unrelated code. The orchestrator, project state/snapshot, narration
authority, and the beat model are untouched — this only changes what the Visualizer
*emits* and how that output is validated and rendered.
