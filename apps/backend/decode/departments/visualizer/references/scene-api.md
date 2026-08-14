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

/** A physical spring, in progress units. Returns 0→1 by default; `delay` and
 *  `duration` are fractions of the beat (0–1), not frames. Reach for this over
 *  `interpolate` when motion should *settle* — entrances, emphasis, anything
 *  physical. `useProgress()` still runs the timeline; this is just an easier
 *  value to feed a `translate`/`scale`/`opacity`. */
export function useSpring(options?: {
  config?: { damping?: number; mass?: number; stiffness?: number; overshootClamping?: boolean };
  from?: number;
  to?: number;
  delay?: number;
  duration?: number;
}): number;

/** Named spring feels, if you would rather not tune damping by hand. */
export const SPRING_PRESETS: { gentle; smooth; bouncy; stiff };

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

## Let motion settle with `useSpring`

For entrances and emphasis, a spring reads more alive than a timed curve. It
returns 0→1; scale or offset from it exactly as with `interpolate`'s output.

```tsx
const enter = useSpring({ config: SPRING_PRESETS.smooth, duration: 0.4 });
// …
style={{ opacity: enter, translate: `0px ${(1 - enter) * 24}px` }}
```

`delay` and `duration` are fractions of the beat (`0.4` = the first 40%), never
frames. Stagger elements by giving each a larger `delay`.

## Never use CSS transitions or animations

`transition`, `animation`, `@keyframes` and Tailwind's `animate-` classes do not
render. They will look correct in the preview and produce wrong frames in the
exported file, which is the worst way for a scene to be broken.

Every moving value is driven by the frame clock — `interpolate(progress, …)` or
`useSpring(…)`, and nothing else. Both read the timeline Decode owns; CSS motion
does not.

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

The example above shows the *mechanics* — a single label. It is not the quality
bar. Aim for the one below.

## The quality bar — a relationship, composed

This is the standard: real surfaces with edges, a drawn relationship rather than a
list, spring choreography in reading order, type hierarchy, and one accent on the
single thing that matters. A scene should look like this, not like a fading title.

```tsx
import { AbsoluteFill, Interactive, useSpring, SPRING_PRESETS, fontCss } from "@decode/animation-api";

export default function Scene(props) {
  const query = useSpring({ config: SPRING_PRESETS.smooth, duration: 0.35 });
  const link = useSpring({ config: SPRING_PRESETS.gentle, delay: 0.35, duration: 0.4 });
  const surface = { background: "#232323", border: "1px solid #484848", borderRadius: 16, padding: "22px 28px" };
  const label = { ...fontCss({ family: "Geist Mono" }), fontSize: 14, letterSpacing: 1 };

  return (
    <AbsoluteFill style={{ background: "#0B0B0B", padding: 96, justifyContent: "center", color: "#F3F0EA", ...fontCss({ family: "Bricolage Grotesque" }) }}>
      <Interactive.Div name="Eyebrow" style={{ ...label, color: "#98A0B3", marginBottom: 40, opacity: query }}>
        {props.eyebrow}
      </Interactive.Div>

      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Interactive.Div name="Query" style={{ ...surface, opacity: query, translate: `${(1 - query) * -28}px 0px` }}>
          <div style={{ ...label, color: "#98A0B3" }}>QUERY</div>
          <div style={{ fontSize: 56, marginTop: 8 }}>{props.query}</div>
        </Interactive.Div>

        <Interactive.Div name="Link" style={{ fontSize: 52, color: "#F2A47B", opacity: link, scale: 0.6 + link * 0.4 }}>→</Interactive.Div>

        <Interactive.Div name="Target" style={{ ...surface, borderColor: "#F2A47B", opacity: link, translate: `${(1 - link) * 28}px 0px` }}>
          <div style={{ ...label, color: "#F2A47B" }}>ATTENDS TO</div>
          <div style={{ fontSize: 56, marginTop: 8 }}>{props.target}</div>
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
}
```

What makes it the bar: two real surfaces (`#232323`/`#484848`) instead of flat
chips; the accent on the *target* alone — the one thing the beat is about; a
`useSpring` sequence that brings the query in, then draws the link and the target,
so the motion *is* the explanation; and mono labels against large display values
for hierarchy. The relationship is drawn, not written.
