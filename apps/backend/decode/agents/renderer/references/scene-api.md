# `@decode/animation-api` — Remotion plus Decode's scene tools

A scene is a self-contained React component and a pure function of Remotion's frame clock. Import
only from `@decode/animation-api`. It re-exports the useful Remotion APIs unchanged and adds the
format, layout, typography and deterministic geometry tools generated scenes need.

```tsx
import {
  AbsoluteFill,
  DesignCanvas,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "@decode/animation-api";

export default function Scene(props) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  // ...
}
```

No raw `remotion` or `react` import, relative module, UI kit, CSS import, network, timers, `eval`,
`new Function` or `dangerouslySetInnerHTML`. Decode supplies the JSX runtime and mounts the component.

## Core Remotion exports

Use these exactly as in Remotion:

```ts
useCurrentFrame();
useVideoConfig(); // width, height, fps, durationInFrames
interpolate();
interpolateColors();
spring();
measureSpring();
Easing;
AbsoluteFill;
Sequence;
Series;
Freeze;
Interactive;
Img;
Audio;
Video;
staticFile();
random(seed);
```

For transforms, prefer separate CSS properties because they remain editable and do not affect
layout:

```tsx
style={{
  opacity,
  translate: `${x}px ${y}px`,
  scale,
  rotate: `${degrees}deg`,
}}
```

When an order-sensitive transform string is actually necessary, the API also exports
`makeTransform`, `translate`, `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`,
`rotateX`, `rotateY`, `rotateZ`, `skew`, `skewX`, `skewY` and `perspective` from Remotion's official
animation utilities.

## Formats and design canvas

The project chooses widescreen, vertical, square, portrait or custom dimensions and 24, 30 or 60
fps. `useVideoConfig()` gives the actual render settings. `useFormat()` additionally gives a
canonical design canvas and safe area:

```ts
const format = useFormat();
// family, width, height, designWidth, designHeight, fps,
// durationInFrames, aspectRatio, safeArea
```

Wrap authored coordinates in `DesignCanvas`. A widescreen scene is always designed at 1920x1080 and
is scaled to 720p, 1080p or 4K by the wrapper. Vertical is 1080x1920, square 1080x1080 and portrait
1080x1350. A custom aspect ratio uses its actual dimensions.

```tsx
<AbsoluteFill style={{background: "#0B0B0B"}}>
  <DesignCanvas>
    {/* canonical design-pixel coordinates */}
  </DesignCanvas>
</AbsoluteFill>
```

`useSafeArea()` returns the content-safe rectangle in canonical design pixels. Backgrounds, glows
and connectors may leave it. Text, diagrams and focal objects stay inside it.

## Plan regions before drawing

Use normalized regions to allocate the composition before writing components:

```tsx
const format = useFormat();
const layout = defineLayout(format, {
  hub: {x: 0.35, y: 0.32, width: 0.30, height: 0.36, space: "safe"},
  left: {x: 0, y: 0.2, width: 0.22, height: 0.6, space: "safe"},
  right: {x: 0.78, y: 0.2, width: 0.22, height: 0.6, space: "safe"},
});
```

`x` and `y` are always the region's **top-left**, never its center. `width` and `height` are normalized
sizes in the same space. A region outside `0..1` is rejected instead of rendering partly outside the
frame. For intentional point anchoring outside `defineLayout`, use `anchorRect()` explicitly.

Use absolute positioning for those major regions and flex/grid inside each component. Do not place
every label and icon with unrelated magic numbers.

Annotate important boxes so preview validation can report clipping and collisions:

```tsx
<LayoutBox id="platform-hub" rect={layout.hub} collision="solid" safe>
  <div style={{position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 16}}>...</div>
</LayoutBox>
```

`LayoutBox` already applies `left`, `top`, `width` and `height`. Its child uses `inset: 0`; never apply
the same rectangle or `rectStyle(layout.hub)` to the child, which would double the offset.

Collision policies are `solid`, `overlay`, `background` and `connector`. Glows and connectors are not
solid. Intentional overlays must say so. Wrap constrained text in `LayoutText`; the preview checks its
scroll dimensions for overflow.

Geometry helpers:

```ts
q(value);                         // deterministic quantisation
clamp(value, minimum, maximum);
mix(from, to, progress);
insetRect(rect, insetX, insetY?);
anchorRect(point, width, height, anchor?);
rectStyle(rect);
radialLayout({center, count, radiusX, radiusY?, startAngle?});
distributeHorizontal(rect, count, gap?);
distributeVertical(rect, count, gap?);
pointOnRectEdge(rect, target, padding?);
intersects(first, second, minimumGap?);
contains(outer, inner, tolerance?);
```

Use `pointOnRectEdge` for arrows and lines so connectors meet a surface edge rather than its center.

## Timing

Use frames and fps for ordinary Remotion timing. Duration comes from the enclosing narration-sized
Sequence; read it, never replace it with a competing `DURATION_IN_FRAMES` constant.

```tsx
const frame = useCurrentFrame();
const {fps, durationInFrames} = useVideoConfig();
const enter = interpolate(frame, [0, 0.45 * fps], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: EASE_PRESETS.easeOut,
});
```

The beat arrives with ordered narration segments. Spread their visible moments across the whole
scene; do not reveal everything in the first second and hold a frozen picture.

For named normalized moments, use `useSceneTiming`:

```tsx
const timing = useSceneTiming({
  establish: {at: 0.02, duration: 0.12},
  connect: {at: 0.28, duration: 0.30},
  resolve: {at: 0.72, duration: 0.16},
});

const connect = timing.progressOf("connect");
```

`useProgress()` and `useSpring()` remain available for normalized animation. `EASE_PRESETS` contains
`linear`, `easeOut`, `easeInOut` and `soft`; `SPRING_PRESETS` contains `gentle`, `smooth`, `bouncy`
and `stiff`.

## Determinism

Every moving value is derived from `useCurrentFrame()`, `interpolate()` or `spring()`. Never use CSS
transitions, CSS animations or keyframes: they do not render correctly frame by frame.

Pass every `Math.sin`, `Math.cos`, `Math.pow` or other platform curve through `q()` before it reaches
a style or SVG attribute. Use `random(seed)`, never `Math.random()`.

```tsx
const bob = q(Math.sin(frame / fps) * 4);
```

## Typography

`fontCss()` resolves fonts loaded by Decode. Available families are `Inter`, `Space Grotesk`,
`Bricolage Grotesque` and `Geist Mono`.

The API re-exports Remotion's official `measureText`, `fitText`, `fitTextOnNLines` and `fillTextBox`
from `@remotion/layout-utils`. Match measurement properties to rendered properties and keep text in a
`LayoutText` so overflow is still checked after a creator edits a control.

```tsx
const fitted = fitText({
  text: props.title,
  withinWidth: layout.hub.width - 64,
  fontFamily: "Inter",
  fontWeight: 700,
});
const titleSize = Math.min(72, fitted.fontSize);
```

## Icons and paths

`Icon` keeps scenes on one dependency-safe icon vocabulary:

```tsx
<Icon name="database" size={32} weight="light" color={props.accent} />
```

Names: `address-book`, `arrow-right`, `brain`, `chart-bar`, `check`, `cloud`, `code`, `credit-card`,
`cube`, `database`, `file-text`, `flow-arrow`, `gear-six`, `globe`, `lightning`, `lock`,
`magnifying-glass`, `play`, `plug`, `pulse`, `question`, `stack`, `users`, `warning`, `x`.

`Path` is an SVG path with normalized draw-on controls:

```tsx
<svg viewBox="0 0 400 200">
  <Path d="M 20 100 C 120 20 280 180 380 100" trimEnd={progress} fill="none" stroke={props.accent} />
</svg>
```

## Scene structure

One default export, but compose it from coordinated internal layers:

```tsx
export default function Scene(props) {
  return (
    <AbsoluteFill style={{background: props.background}}>
      <DesignCanvas>
        <AtmosphereLayer />
        <ConnectionLayer />
        <SubjectLayer />
        <EvidenceLayer />
        <AnnotationLayer />
      </DesignCanvas>
    </AbsoluteFill>
  );
}
```

Not every scene needs every layer. Motion must explain a relationship or state change. After a scene
settles, allow at most one continuous motion system, and only when it communicates an ongoing process.

Do not export `CONTROLS`; Decode writes it from the structured controls beside the source. Every
`props.<name>` used by the component must have a declared control.
