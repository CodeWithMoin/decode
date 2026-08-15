# REMOTION-FEATURE-ROADMAP.md — what we use, and what we'll add

> **⚠️ Substrate migration in progress — read this first.**
> Decode is migrating its render substrate **off Remotion to HyperFrames** — see
> **`VISUALIZER-TO-HYPERFRAMES.md`** (the live plan) and `HYPERFRAMES-ARCHITECTURE-REVIEW.md`.
> One scene is already ported by hand (`hyperframes/self-attention/`), rendering
> deterministically. Remotion is still today's substrate under the hood — the Motion
> Designer department emits Remotion-flavored React and the frontend preview still
> uses `@remotion/player` — but it is on the way out.
>
> **So much of the backlog below is SUPERSEDED.** The question for any item that
> means "adopt more Remotion capability" is no longer *"add this Remotion feature?"*
> but ***"does HyperFrames already cover this capability?"*** — because we don't want
> to invest in the substrate we're leaving. Each item below is tagged:
> - **[capability — still relevant]** — the *need* (e.g. captions, transitions,
>   real audio duration) matters regardless of substrate. Keep it, but implement it
>   on the substrate we're keeping.
> - **[superseded]** — this is Remotion-specific plumbing HyperFrames replaces; do
>   not build it on Remotion. Re-frame as "does HyperFrames cover it?"
> - **[done]** — already shipped.

Remotion (v4.0.508) is Decode's render substrate today — behind a Decode-owned port,
per ADR-007 (`decisions.md`). This is the running list of which Remotion features
we expose today and which good ones we'll add progressively — now read against the
HyperFrames migration above.

## The one rule that governs all of this

Generated scenes may import **only** from `@decode/animation-api`
(`apps/frontend/src/decode/animation-api.tsx`) — enforced by the static gate in
`visualizer/validation.py`. So adding a feature "for scenes" means **re-exporting
it through that one SDK file** (often wrapped into progress units, since scenes
never see `fps`/`durationInFrames`), and teaching the Visualizer via
`visualizer/references/scene-api.md`. Infra-only features (transitions at the
composition level, cloud render) live outside the SDK and don't touch the gate.

Where each feature plugs in:
- **SDK** — re-export through `animation-api.tsx` (+ doc in `scene-api.md`). Cheap.
- **dep** — `npm i @remotion/<x>`, then usually SDK-wrap it.
- **infra** — host/render pipeline only (`DecodeComposition.tsx`, `render-video.ts`,
  `renders/`), not the scene SDK.

---

## In use today

- **Timing:** `useCurrentFrame`, `useVideoConfig`, `interpolate`, `Sequence`,
  `Series`, `Freeze` (scenes get progress-unit wrappers: `useProgress`,
  `useCanvas`, `Segment`).
- **Motion:** `Easing` + `EASE_PRESETS`; **`spring()` → `useSpring` + `SPRING_PRESETS`** (added — see Done).
- **Media:** `Img`, `Audio`, `staticFile`.
- **Composition/host:** `Composition`, `registerRoot`, `AbsoluteFill`, `Interactive`.
- **Preview:** `@remotion/player` `<Player>`.
- **Export:** `@remotion/bundler` `bundle()` + `@remotion/renderer`
  `selectComposition`/`renderMedia` → MP4 (local Node subprocess).

## Done

- ✅ **`spring()`** — progress-native `useSpring({ config, from, to, delay, duration })`
  + `SPRING_PRESETS` (gentle/smooth/bouncy/stiff). Physical motion instead of only
  bezier curves. *(SDK)*

---

## Next up (rough priority)

### 1. Real audio duration → timing · ✅ done (via mutagen, not Remotion) · [capability — still relevant, now done]
**Completed — and deliberately *not* with `@remotion/media-utils`.** The Voice
department no longer estimates clip duration from character count; it reads the real
mp3 duration on the backend with **mutagen**, closing the loop on **ADR-005 (audio is
the timing authority)**. The **beat-timing model now builds on this measured
duration** — `decode/timing.py` resolves anchors against real word timings, and the
scene's `data-duration` is stamped from the measured narration (see
`VISUALIZER-TO-HYPERFRAMES.md §3`). This was the highest-value correctness win and it
is closed; because the reader is a Python backend dependency, no Remotion package was
needed. *This is the archetype for the whole doc: the capability mattered, the
Remotion feature that once represented it did not.*

### 2. Captions · [capability — still relevant, substrate TBD]
Auto on-screen captions synced to narration — we already store per-beat audio +
the exact narration text, so the caption source is free. Big perceived-quality and
accessibility win. **The capability stands regardless of substrate; the `@remotion/captions`
implementation does not.** Before building on Remotion, ask whether HyperFrames'
captioning covers it (see the `captions-overlay` / `embedded-captions` workflows) —
we should not add a caption component to a substrate we're retiring.

### 3. Scene transitions · [capability — still relevant, substrate TBD]
Slide/fade/wipe between beats instead of hard cuts. **The capability stands; the
`@remotion/transitions` `<TransitionSeries>` implementation is [superseded].**
Transitions live at the **composition** level either way (Decode picks them; scenes
stay unaware) — so this belongs to whatever composition layer HyperFrames gives us,
not to `DecodeComposition`. Check HyperFrames' transition support before building.

### 4. Video source material (`OffthreadVideo`, `Video`) · [superseded]
Embedding a video clip (screen recording, b-roll) in a scene is a capability we'll
still want, but `OffthreadVideo`/`Video` are Remotion-specific. HyperFrames owns
media playback (framework-owned media + `/media-use`); reach for that, not the
Remotion primitives. Do not widen the Remotion scene SDK for this.

### 5. Async assets done right (`delayRender` / `continueRender`) · [superseded]
Waiting for fonts/fetched data before a frame renders is Remotion's render-lifecycle
API and has no place on a substrate we're leaving. HyperFrames' deterministic-render
contract handles asset readiness its own way. Do not build on `delayRender`.

---

## Later / bigger bets

> **All Remotion-package bets below are [superseded] by the HyperFrames migration.**
> None should be adopted *on Remotion*. Each names a real capability (cloud render,
> shapes/paths, Lottie, GIF, 3D, data-driven metadata) — treat every one as "does
> HyperFrames already cover this?" and build there, not here. Kept only so the
> capability list isn't lost in the move.

- **Cloud + parallel render (`@remotion/lambda`)** · infra — today the backend
  shells out to a **local** Node subprocess (`renders/department.py`). Fine for
  dev; a scaling ceiling for real traffic. Swap the port implementation, not the
  callers.
- **Richer primitives** · dep/SDK — `@remotion/shapes` (rects, circles, triangles),
  `@remotion/paths` (SVG path helpers, `evolvePath` for line-drawing), `@remotion/noise`
  (organic motion), `@remotion/motion-blur` (trail/blur polish).
- **`@remotion/lottie`** · dep — drop in designer-made Lottie animations.
- **`@remotion/gif`** · dep — render/consume GIFs.
- **`@remotion/three`** · dep — 3D scenes via React Three Fiber. Large surface;
  only if a teaching topic genuinely needs 3D.
- **`calculateMetadata`** · infra — data-driven composition duration/dimensions
  computed before render, if project runtime should be derived server-side.
- **`@remotion/studio`** · infra — the Remotion visual editor. Almost certainly
  *not* wanted — Decode's Edit stage is the editor, and HyperFrames-behind-a-port
  (ADR-007) is the intended substrate direction, so don't couple to Studio.

---

## How to add one (checklist)

1. If it's for scenes: re-export (or SDK-wrap into progress units) in
   `animation-api.tsx`; document it in `visualizer/references/scene-api.md`.
2. Quantize anything derived from `sin`/`cos`/`pow`/`exp` with `toFixed(6)` before
   it reaches the DOM — Node vs browser libm differ (hydration trap, `CLAUDE.md`).
3. Make sure the render bundler alias covers any new package
   (`scripts/render-video.ts` `webpackOverride`).
4. Confirm the gate (`visualizer/validation.py`) still passes — new SDK exports
   are allowed; new bare import specifiers are not.
5. Move the item to **Done** here.
