# REMOTION-FEATURE-ROADMAP.md — what we use, and what we'll add

Remotion (v4.0.508) is Decode's render substrate — behind a Decode-owned port,
per ADR-007 (`decisions.md`). This is the running list of which Remotion features
we expose today and which good ones we'll add progressively.

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

### 1. Real audio duration → timing (`@remotion/media-utils`) · dep
`useAudioData` + `getAudioDurationInSeconds`. The Voice department currently
*estimates* clip duration from character count (`_CHARS_PER_SECOND` in
`voice/__init__.py`). Reading the real mp3 duration closes the loop on **ADR-005
(audio is the timing authority)** instead of approximating it. Highest-value
correctness win. *Touches voice department + timing projection, not the scene SDK.*

### 2. Captions (`@remotion/captions`) · dep
Auto on-screen captions synced to narration — you already store per-beat audio +
the exact narration text, so the caption source is free. Big perceived-quality
and accessibility win. *SDK-wrap a caption component; feed it beat narration + audio.*

### 3. Scene transitions (`@remotion/transitions`) · infra
`<TransitionSeries>` with slide/fade/wipe between beats, instead of hard cuts.
Lives at the **composition** level (`DecodeComposition`), not inside a scene, so
it doesn't widen the scene SDK or the gate. *Decode picks the transition; scenes
stay unaware.*

### 4. Video source material (`OffthreadVideo`, `Video`) · SDK
Let a scene embed a video clip (screen recording, b-roll). `OffthreadVideo` is the
render-correct one. Needs an asset-fetch story (see delayRender). *SDK, gated.*

### 5. Async assets done right (`delayRender` / `continueRender`) · SDK/infra
Wait for fonts/fetched data before a frame renders — prevents the flash where a
scene renders before its font loads. Add if scenes start pulling remote assets.

---

## Later / bigger bets

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
