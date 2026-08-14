# `@decode/animation-api`

The only module a scene may import from. Behind it is Remotion, re-exported
under its own names, so everything here works exactly as you already know it.

One thing is different, and only one: a scene has no frame clock and cannot ask
how long it runs.

```ts
/** Where the beat is: 0 at its first frame, 1 at its last.
 *
 *  This replaces `useCurrentFrame()`. There is deliberately no `useVideoConfig`
 *  and no way to reach `fps` or `durationInFrames` — the approved plan owns
 *  runtime, and a scene that knew its own length could contradict it. */
export function useProgress(): number;

/** The rendered frame's size. Size is not duration, so this one is safe. */
export function useCanvas(): { width: number; height: number };

/** A slice of the beat, in progress units. Replaces `<Sequence from={frames}>`,
 *  which is not available because it is written in frames you may not see.
 *  `useProgress()` inside a Segment restarts at 0. */
export const Segment: React.FC<{
  from?: number;
  to?: number;
  name?: string;
  children?: React.ReactNode;
}>;

// Everything below is Remotion's, unchanged.
export { interpolate, Easing, AbsoluteFill, Series, Freeze, Interactive, Img, staticFile, random };

/** A font, resolved against the fonts the studio has already loaded. */
export function fontCss(font: {
  family: "Bricolage Grotesque" | "Inter" | "Space Grotesk" | "Geist Mono";
  variant?: "normal" | "italic";
  weight?: string | number;
}): React.CSSProperties;

/** Named curves, if you would rather not write the bezier by hand. */
export const EASE_PRESETS: { linear; easeOut; easeInOut; soft };

/** An SVG `<path>`, for diagrams and connectors. */
export const Path: React.FC<React.SVGProps<SVGPathElement>>;
```

## Drive motion with `interpolate`, over progress

Same function, same options. The first argument is progress, so the input range
is a fraction of the beat rather than a frame number.

```tsx
interpolate(progress, [0, 0.3], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.22, 1, 0.36, 1),
});
```

`Easing.bezier(0.22, 1, 0.36, 1)` is Decode's curve and the right default.
`Easing.spring({ damping: 200 })` gives a push with no bounce.

## Keep `interpolate` inline in `style`

Put the call in the style object rather than computing a constant above. Use the
individual `translate`, `scale` and `rotate` properties instead of building a
`transform` string.

```tsx
// Good
style={{
  translate: interpolate(progress, [0, 0.35], ["0px 20px", "0px 0px"], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  }),
}}

// Bad — the value is hidden and the scene stops being directly editable
const rise = interpolate(progress, [0, 0.35], [20, 0]);
style={{ transform: `translateY(${rise}px)` }}
```

Reach for a `transform` string only for things the individual properties do not
cover, such as `skew` or `perspective`.

## Never use CSS transitions or animations

`transition`, `animation`, `@keyframes` and Tailwind's `animate-` classes do not
render. They will look correct in the preview and produce wrong frames in the
exported file, which is the worst way for a scene to be broken.

Every moving value comes from `interpolate` and nowhere else.

## Name the elements you want to be editable

Wrap anything a person might want to select or restyle in `Interactive.Div` with
a fixed, descriptive `name`. Keep its styles inline and plain.

```tsx
<Interactive.Div name="Hero title" style={{ fontSize: 72, color: "#E8E8EC" }}>
  Attention
</Interactive.Div>
```

Write fixed copy directly inside the element rather than lifting it into a
constant. Use a control prop only when the text is something a creator would
reasonably want to change.

## Quantise anything from a curve

Values from `Math.sin`, `Math.cos` or `Math.pow` differ in their last decimal
between the render host and the browser. Round before it reaches a style value.

```tsx
const wobble = Number((Math.sin(progress * Math.PI) * 40).toFixed(3));
```

Use `random(seed)` rather than `Math.random`, which would make two renders of the
same frame differ.

## Shape of a scene

```tsx
import { useProgress, interpolate, Easing, AbsoluteFill, Interactive, fontCss } from "@decode/animation-api";

export default function Scene(props) {
  const progress = useProgress();

  return (
    <AbsoluteFill style={{ background: props.background, display: "grid", placeItems: "center" }}>
      <Interactive.Div
        name="Label"
        style={{
          ...fontCss({ family: "Bricolage Grotesque", weight: 600 }),
          fontSize: props.labelSize,
          color: "#E8E8EC",
          opacity: interpolate(progress, [0, 0.25], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
          translate: interpolate(progress, [0, 0.35], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
        }}
      >
        {props.label}
      </Interactive.Div>
    </AbsoluteFill>
  );
}
```

No `CONTROLS` block. `props.background`, `props.label` and `props.labelSize` are
declared as structured controls alongside the component, and Decode writes the
manifest from them.
