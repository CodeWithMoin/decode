# Translation notes — self-attention sample scene (Remotion → HyperFrames)

First representative scene ported per AGENT-GRAPH / the audio-sync §10 target.
Source: `apps/backend/decode/departments/visualizer/samples/scene.tsx` (a React
scene importing only the Decode port `@decode/animation-api`, which is itself
implemented on Remotion). Output: `index.html` (this project).

## Status
- `npx hyperframes check` → **0 errors** (lint/runtime/layout/motion/contrast).
- `npx hyperframes render` → deterministic MP4 (120 frames, static-frame dedup
  verified reusable — confirms determinism, §10 test #8).

## Faithful mappings
- `useProgress()` + `interpolate(progress, [0,0.25], [0,1])` (opacity) → a GSAP
  `fromTo(opacity 0→1, duration 1.0s)` at t=0 on the paused timeline.
- `interpolate(progress, [0,0.35], [20,0])` (translateY) → `fromTo(y 20→0,
  duration 1.4s)` at t=0. Durations are the progress fractions × the 4s scene.
- `AbsoluteFill` + `place-items:center` → a full-bleed `#center` grid; the stage
  fill lives on `#stage-bg` (never on the root — producer compositing rule).

## Gaps / approximations (the "lossy 20%")
1. **Easing** — `Easing.bezier(0.22, 1, 0.36, 1)` → GSAP `power4.out`
   (≈ cubic-bezier 0.23,1,0.32,1). Sub-pixel difference; swap to a registered
   `CustomEase` if an SSIM pass wants exact.
2. **FPS** — Decode composes at **24fps** (`DECODE_FPS`); this render used
   HyperFrames' default **30fps** (120 frames / 4s). Set the project fps to 24
   before any frame-accurate SSIM comparison against the Remotion baseline.
3. **Font** — `Bricolage Grotesque 600` is loaded via a Google Fonts `<link>`.
   HyperFrames fetched + injected deterministic `@font-face` (works), but `check`
   warns `google_fonts_import`; bundle a local `.woff2` for full offline
   determinism.
4. **`Interactive.Div name="Label"`** → a plain `<div id="label">`. The `name`
   was a Decode control hook (Segment/CONTROLS naming), not a render concern;
   it maps to a stable element id when we wire the direction/beat controls.
5. **Props** — `props.label` / `props.background` are hardcoded to the sample's
   values here. The generalized port parameterizes them via root `data-*` vars.

## Not done in this slice (follow-ups)
- **SSIM vs Remotion baseline** (skill Step 4 eval): Decode has no standalone
  Remotion render of *just* this scene (`render-video.ts` renders a whole
  project), so a like-for-like baseline needs wiring first. The HF side renders
  deterministically; the formal diff is the next validation step.
- Generalizing: the Visualizer emitting HF compositions (or a React-port→HF step)
  instead of Remotion-flavored React — this proved one scene by hand.
