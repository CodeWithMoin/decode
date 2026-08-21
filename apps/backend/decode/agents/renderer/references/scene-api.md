# `@decode/animation-api` — the scene contract

A scene is one self-contained React component, a pure function of Remotion's frame clock. Import
**only** from `@decode/animation-api`; it re-exports the Remotion runtime plus a toolkit of drawing
libraries and a few layout primitives. No raw `remotion`/`react` import, relative module, UI kit, CSS
import, network, timers, `eval`, `new Function`, or `dangerouslySetInnerHTML`.

```tsx
import { AbsoluteFill, Act, d3, paths, useCurrentFrame, useVideoConfig } from "@decode/animation-api";

export default function Scene({ words }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // ...
}
```

## What a scene is

A **full-frame 1920x1080 landing page that animates, timed to the voice.** It fills the stage —
eyebrow + title, one dominant visual, real hierarchy, generous margins — never a small element
floating in an empty frame. Build the visual with the **right library** (see below), not hand-drawn
rectangles-as-charts.

## The drawing toolkit — reach for the right one

All re-exported from `@decode/animation-api`. Exact signatures are in the prompt's LIBRARY REFERENCE.

- `d3` — data, charts, curves, plots, axes. A loss curve is `d3.line` on `d3` scales, not pills.
- `paths` — `paths.evolvePath(progress, d)` to draw a path on; `paths.interpolatePath(t, dA, dB)` to
  morph. Never hand-roll `strokeDasharray`/`strokeDashoffset`.
- `shapes` — `Circle`, `Rect`, `Star`, `Arrow`, `Callout`, `Pie` as clean vector `<svg>`.
- `roughNotation` — `Circle`, `Underline`, `Highlight`, `Box`, `Bracket`, `StrikeThrough`,
  `CrossedOff`; hand-drawn teaching marks, `animationProgress={t}` reveals them.
- `gsap` via `useGsapTimeline(tl => …)` — choreographed timeline motion, seeked to the frame.
- `THREE` / `ThreeCanvas` — 3D. `Lottie` — lightweight vector motion. `noise` — texture/backgrounds.
  `motionBlur`, `effects`, `transitions`, `gif` — polish.

## Timing to the voice — `Act`

`words` is the narration's speech-to-text word timing: `[{ word, startInSeconds, endInSeconds }]`.

```tsx
<Act from="loss starts high" to="lowers it" words={words}>
  {(t) => /* t is 0→1 across this act */ <Curve progress={t} />}
</Act>
```

`from`/`to` are **verbatim** narration snippets; the act shows only during that span and crossfades to
the next. A persistent element (a graph that stays and keeps changing) lives **outside** any `Act`
and animates off `useCurrentFrame()` / `words`.

## Layout primitives (relational, never magic numbers)

- `Stack` / `Row` — sibling groups with a real `gap`; they can't collide.
- `Grid` — a grid of cells.
- `Anchor` — a caption/label beside a subject: `<Anchor side="right" gap={24} label={…}>{subject}</Anchor>`.
- `Label` — every standalone text run: measures itself, steps its size down to fit, never overflows.
- `CodeBlock` — syntax-highlighted code with a line highlight.
- `Path` — an SVG path with a normalized `trimEnd={progress}` draw-on.
- `Icon` — one icon vocabulary: `<Icon name="database" size={32} />`.

Absolute pixel positioning is allowed only **inside an `<svg>` you draw**; every `<svg>` declares a
`viewBox`. Text is HTML (`Label` or a `<div>`), **never** `<svg><text>`.

The legacy layout helpers `DesignCanvas`, `defineLayout`, `LayoutBox`, and `LayoutText` still exist
for old scenes but are **not used** here — compose the frame directly with the primitives above.

## Text that fits

`@remotion/layout-utils` is re-exported: `fitText`, `fitTextOnNLines`, `measureText`, `fillTextBox`.
Call each with **one options object**, never positional args. Match measured properties to rendered
properties. Simplest path: size with CSS (`fontSize`, `lineHeight`, `overflow`).

## Determinism

Every moving value derives from `useCurrentFrame()` (or an act's local `t`), through `interpolate()`
or `spring()`. No CSS transitions/animations/keyframes, no timers, no `Math.random()` (use
`random(seed)`). Pass any `Math.sin`/`cos`/`pow` through `q()` before it reaches a style or SVG
attribute — Node and browser libm differ in the last ULP and React reports a hydration mismatch.

## Background & palette

Paint your **own** background per scene (a `noise`/`effects` gradient or wash) — the scene owns the
whole frame. Use exactly the `palette` in the production direction for every color; vary emphasis
with opacity and weight, not new hues.

## Duration & staging

Real duration is stamped later from narration. Compute every reveal boundary from
`useVideoConfig().durationInFrames`, never literal frame numbers. Stage the narration segments in
order across the whole scene — the last segment lands in the final third, never everything in the
first second followed by a frozen frame. Build, never erase: once an element appears it stays (dim
it to make room), so the final frame holds the whole picture.

## Controls

Default-export `function Scene({ words })`. Declare two to six creator controls in the structured
`controls` field. Do **not** write a `CONTROLS` export inside the TSX; Decode generates it.
