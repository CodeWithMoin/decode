import type { CSSProperties, ReactNode, SVGProps } from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  Interactive,
  Sequence,
  Series,
  type SpringConfig,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * `@decode/animation-api` — the only module a generated scene may import from.
 *
 * In front it is ours. Behind it is Remotion, re-exported under Remotion's own
 * names, so a model writing a scene writes the Remotion it already knows.
 *
 * Three things are deliberately not re-exported, and the withholding is the
 * point. `validation.py` in the Visualizer department checks for them as well,
 * but that check is a backstop. This file is the lock.
 *
 *   useCurrentFrame, useVideoConfig — the clock. A scene calls `useProgress()`
 *     and has no way to reach `fps` or `durationInFrames`. The approved
 *     Teaching Plan owns runtime; a scene that knew its own length could
 *     contradict it, and `total = Σ dur` would stop being true.
 *
 *   Sequence — takes frames. `Segment` is the same capability in progress
 *     units, with the arithmetic on this side of the door.
 *
 *   Composition, Player — these belong to the host that mounts a scene. Decode
 *     passes `durationInFrames` in from the plan.
 *
 * Everything else Remotion offers can be added here as it is needed. It goes
 * through this one door rather than becoming a second specifier a scene may
 * name, which is what keeps the import allowlist a one-line check.
 */

export {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  Interactive,
  Series,
  interpolate,
  random,
  staticFile,
};

/**
 * Where the current beat is: 0 at its first frame, 1 at its last.
 *
 * Quantised before it leaves: Node and browser libm disagree in the last ULP,
 * and an unrounded progress would carry that difference into every interpolate
 * downstream and show up as a hydration mismatch.
 */
export function useProgress(): number {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (durationInFrames <= 1) return 0;
  const raw = frame / (durationInFrames - 1);
  return Number(Math.min(1, Math.max(0, raw)).toFixed(6));
}

/** The rendered frame's size. Size is not duration, so this one is safe. */
export function useCanvas(): { width: number; height: number } {
  const { width, height } = useVideoConfig();
  return { width, height };
}

export type { SpringConfig };

/**
 * A physical spring, in progress units.
 *
 * Remotion's `spring()` is written in frames + fps a scene may not see, the same
 * reason `Segment` exists — so this reads the clock on our side and exposes only
 * progress. `delay` and `duration` are fractions of the beat (0–1), not frames.
 * Returns the eased value (0→1 by default); multiply or feed it into a `translate`
 * the way you would `useProgress()`.
 *
 * Prefer this over `interpolate` when motion should *settle* — entrances,
 * emphasis, anything that should feel physical rather than timed. Pick a feel
 * from `SPRING_PRESETS` or pass your own `config`.
 */
export function useSpring(
  options: {
    config?: Partial<SpringConfig>;
    from?: number;
    to?: number;
    delay?: number;
    duration?: number;
  } = {},
): number {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { config, from = 0, to = 1, delay = 0, duration } = options;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const value = spring({
    frame,
    fps,
    config,
    from,
    to,
    delay: Math.round(clamp01(delay) * durationInFrames),
    durationInFrames:
      duration === undefined
        ? undefined
        : Math.max(1, Math.round(clamp01(duration) * durationInFrames)),
  });
  // Quantised for the same reason as useProgress: spring is exponential/trig
  // internally, Node and browser libm disagree in the last ULP, and an unrounded
  // value hydrates mismatched.
  return Number(value.toFixed(6));
}

/**
 * A slice of the beat, in progress units.
 *
 * Remotion's `<Sequence from={1 * fps}>` is how you delay or trim inside a
 * scene, and it is written in frames a scene may not see. This is the same
 * thing with the conversion on our side.
 *
 * NOTE: this assumes Remotion scopes `useVideoConfig().durationInFrames` to the
 * enclosing Sequence, so `useProgress()` inside a Segment measures the slice
 * rather than the whole beat. That is the documented behaviour and has not yet
 * been confirmed against a real render here — check it the first time a
 * segmented scene is previewed.
 */
export function Segment({
  from = 0,
  to = 1,
  name,
  children,
}: {
  from?: number;
  to?: number;
  name?: string;
  children?: ReactNode;
}) {
  const { durationInFrames } = useVideoConfig();
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
  const start = Math.round(clamp(from) * durationInFrames);
  const end = Math.round(clamp(to) * durationInFrames);
  return (
    <Sequence
      from={start}
      durationInFrames={Math.max(1, end - start)}
      name={name}
      layout="none"
    >
      {children}
    </Sequence>
  );
}

export type DecodeFont = {
  family: string;
  variant?: "normal" | "italic";
  weight?: string | number;
};

export type StringControl = {
  type: "string";
  default: string;
  label: string;
};

export type NumberControl = {
  type: "number";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
};

export type ColorControl = {
  type: "color";
  default: string;
  label: string;
};

export type FontControl = {
  type: "font";
  default: DecodeFont;
  label: string;
};

export type BooleanControl = {
  type: "boolean";
  default: boolean;
  label: string;
};

export type SelectControl = {
  type: "select";
  default: string;
  options: readonly string[];
  label: string;
};

export type ControlDefinition =
  | StringControl
  | NumberControl
  | ColorControl
  | FontControl
  | BooleanControl
  | SelectControl;

export type ControlSchema = Record<string, ControlDefinition>;

export type ControlValues<Schema extends ControlSchema> = {
  [Key in keyof Schema]: Schema[Key]["default"];
};

export function defineControls<const Schema extends ControlSchema>(schema: Schema) {
  return schema;
}

const FONT_FAMILIES: Record<string, string> = {
  "Space Grotesk": "var(--font-space-grotesk)",
  Inter: "var(--font-inter)",
  "Bricolage Grotesque": "var(--font-bricolage)",
  "Geist Mono": "var(--font-geist-mono)",
};

export function fontCss(font: DecodeFont): CSSProperties {
  return {
    fontFamily: FONT_FAMILIES[font.family] ?? font.family,
    fontStyle: font.variant ?? "normal",
    fontWeight: font.weight ?? 400,
  };
}

export function Path(props: SVGProps<SVGPathElement>) {
  return <path {...props} />;
}

export const EASE_PRESETS = {
  linear: Easing.linear,
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
  soft: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

/** Named feels for `useSpring({ config })`, the way EASE_PRESETS names curves. */
export const SPRING_PRESETS = {
  gentle: { damping: 20, mass: 1, stiffness: 80 },
  smooth: { damping: 26, mass: 1, stiffness: 120 },
  bouncy: { damping: 10, mass: 1, stiffness: 140 },
  stiff: { damping: 30, mass: 1, stiffness: 260 },
} as const;
