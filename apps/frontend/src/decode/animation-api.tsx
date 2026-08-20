import type { CSSProperties, HTMLAttributes, ReactNode, SVGProps } from "react";
import { Children, Fragment } from "react";
import {
  AddressBook,
  ArrowRight,
  Brain,
  ChartBar,
  Check,
  Cloud as PhosphorCloud,
  Code,
  CreditCard,
  Cube,
  Database as PhosphorDatabase,
  FileText,
  FlowArrow,
  GearSix,
  Globe,
  Lightning,
  Lock,
  MagnifyingGlass,
  Play,
  Plug,
  Pulse,
  Question,
  Stack as StackIcon,
  Users,
  Warning,
  X,
  type IconProps as PhosphorIconProps,
} from "@phosphor-icons/react";
import {
  fillTextBox,
  fitText,
  fitTextOnNLines,
  measureText,
} from "@remotion/layout-utils";
import {
  makeTransform,
  perspective,
  rotate,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  scaleX,
  scaleY,
  skew,
  skewX,
  skewY,
  translate,
  translateX,
  translateY,
} from "@remotion/animation-utils";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  Interactive,
  Sequence,
  Series,
  Video,
  type SpringConfig,
  interpolate as remotionInterpolate,
  interpolateColors as remotionInterpolateColors,
  measureSpring,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Remotion's interpolate throws on a non-monotone inputRange. Generated scenes
 * compute their ranges from durations they don't fully control (a short scene
 * can put its exit before its entrance ends), so the API they import repairs
 * the range instead of crashing the frame: each point is forced strictly above
 * the previous one. The scene renders with a compressed transition rather than
 * a thrown error — correctness by construction at the boundary, not in the
 * generated code.
 */
function monotone(inputRange: readonly number[]): number[] {
  const fixed = [...inputRange];
  for (let i = 1; i < fixed.length; i++) {
    if (fixed[i] <= fixed[i - 1]) fixed[i] = fixed[i - 1] + 0.001;
  }
  return fixed;
}

export const interpolate = ((...args: Parameters<typeof remotionInterpolate>) => {
  args[1] = monotone(args[1]);
  return remotionInterpolate(...args);
}) as typeof remotionInterpolate;

export const interpolateColors = ((...args: Parameters<typeof remotionInterpolateColors>) => {
  args[1] = monotone(args[1]);
  return remotionInterpolateColors(...args);
}) as typeof remotionInterpolateColors;

/**
 * `@decode/animation-api` is the only module generated scenes import. It keeps
 * Remotion's familiar frame-based APIs intact and adds Decode's format, layout,
 * typography and deterministic-geometry helpers. Composition registration,
 * players and render infrastructure remain host concerns and are not exported.
 */

export {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  Interactive,
  Sequence,
  Series,
  Video,
  fillTextBox,
  fitText,
  fitTextOnNLines,
  makeTransform,
  measureSpring,
  measureText,
  perspective,
  random,
  rotate,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  scaleX,
  scaleY,
  skew,
  skewX,
  skewY,
  spring,
  staticFile,
  translate,
  translateX,
  translateY,
  useCurrentFrame,
  useVideoConfig,
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

/* ---------------------------------------------------------------------------
 * Relational layout primitives — the model states relationships, the
 * components own the geometry. This is the placement contract for generated
 * scenes: groups flow through Stack/Row (a gap is mandatory, so siblings can
 * never touch), captions attach through Anchor (label and target render as one
 * flex pair, so a label physically cannot overlap or drift from its subject),
 * and every standalone piece of text is a Label that measures itself with the
 * same canvas metrics the renderer uses, stepping its size down to fit rather
 * than breaking mid-word. Free-form absolute positioning stays available
 * INSIDE an SVG diagram, where the model draws well — these primitives govern
 * the space BETWEEN elements, which is where generated scenes used to collide.
 * ------------------------------------------------------------------------- */

type GroupProps = {
  gap: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  style?: CSSProperties;
  children?: ReactNode;
};

/** Vertical group. The required `gap` is the no-collision guarantee. */
export function Stack({ gap, align = "flex-start", justify, style, children }: GroupProps) {
  return (
    <div
      data-decode-box="group"
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal group. Same contract as Stack. */
export function Row({ gap, align = "center", justify, style, children }: GroupProps) {
  return (
    <div
      data-decode-box="group"
      style={{
        display: "flex",
        flexDirection: "row",
        gap,
        alignItems: align,
        justifyContent: justify,
        // A Row wider than its container must not silently grow past the
        // frame; capping it makes the overflow visible (and inspectable).
        maxWidth: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Attach a label (or any small element) to a subject on a named side.
 * Attachment is by composition — the pair renders as one flex unit — so the
 * label can never be absolutely positioned into a collision with its subject.
 */
export function Anchor({
  side,
  gap,
  label,
  align = "center",
  style,
  children,
}: {
  side: "top" | "bottom" | "left" | "right";
  gap: number;
  label: ReactNode;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const vertical = side === "top" || side === "bottom";
  const labelFirst = side === "top" || side === "left";
  return (
    <div
      data-decode-box="group"
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        gap,
        alignItems: align,
        ...style,
      }}
    >
      {labelFirst ? label : children}
      {labelFirst ? children : label}
    </div>
  );
}

/**
 * The relationship BETWEEN two elements: a line (optionally arrowed) that fills
 * the space separating exactly two children, with an optional label owned by
 * the connector itself. The label renders inside the connecting segment — the
 * one place a between-caption can never cross either subject. The segment
 * flexes to absorb whatever space the layout gives the pair, so the connector
 * is also the correct way to say "these two things relate across this gap".
 */
export function Connector({
  direction = "row",
  label,
  gap = 12,
  minLength = 64,
  color = "currentColor",
  thickness = 2,
  dashed,
  arrow,
  align = "center",
  style,
  children,
}: {
  direction?: "row" | "column";
  label?: ReactNode;
  gap?: number;
  minLength?: number;
  color?: string;
  thickness?: number;
  dashed?: boolean;
  arrow?: boolean;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const horizontal = direction === "row";
  const items = Array.isArray(children) ? children : [children];
  const line = (
    <div
      style={{
        flex: 1,
        ...(horizontal
          ? { height: thickness, minWidth: minLength }
          : { width: thickness, minHeight: minLength }),
        ...(dashed
          ? {
              backgroundImage: horizontal
                ? `repeating-linear-gradient(90deg, ${color} 0 8px, transparent 8px 16px)`
                : `repeating-linear-gradient(180deg, ${color} 0 8px, transparent 8px 16px)`,
            }
          : { backgroundColor: color }),
      }}
    />
  );
  const head = arrow ? (
    <div
      style={{
        width: 0,
        height: 0,
        ...(horizontal
          ? {
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              borderLeft: `9px solid ${color}`,
            }
          : {
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `9px solid ${color}`,
            }),
      }}
    />
  ) : null;
  return (
    <div
      data-decode-box="connector"
      style={{
        display: "flex",
        flexDirection: direction,
        alignItems: align,
        gap,
        ...style,
      }}
    >
      {items[0]}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: horizontal ? "column" : "row",
          alignItems: "center",
          gap: 8,
          ...(horizontal ? { minWidth: minLength } : { minHeight: minLength }),
          // A long between-label must widen the line, not shove both
          // subjects toward the frame edges.
          ...(horizontal ? { maxWidth: minLength * 4 } : { maxHeight: minLength * 4 }),
        }}
      >
        {label}
        <div
          style={{
            display: "flex",
            flexDirection: direction,
            alignItems: "center",
            alignSelf: "stretch",
            flex: 1,
          }}
        >
          {line}
          {head}
        </div>
      </div>
      {items[1]}
    </div>
  );
}

/**
 * A standalone connector segment: a draw-on line (optionally arrowed) of a
 * fixed length, for joining flex siblings into a chain — the pair-based
 * `Connector` cannot, because it owns both of its endpoints as children.
 * `progress` is the 0..1 draw-on supplied by the choreography runtime: the
 * line reveals from its source end and the head fades in over the final
 * stretch, so an arrowhead can never pop in or detach mid-draw.
 */
export function Arrow({
  direction = "row",
  length = 64,
  color = "currentColor",
  thickness = 2,
  head = true,
  progress = 1,
  style,
}: {
  direction?: "row" | "column";
  length?: number;
  color?: string;
  thickness?: number;
  head?: boolean;
  progress?: number;
  style?: CSSProperties;
}) {
  const horizontal = direction === "row";
  const reveal = Math.max(0, Math.min(1, progress));
  const headProgress = Math.max(0, Math.min(1, (progress - 0.8) / 0.2));
  return (
    <div
      data-decode-box="connector"
      style={{
        display: "flex",
        flexDirection: direction,
        alignItems: "center",
        ...(horizontal ? { width: length } : { height: length }),
        ...style,
      }}
    >
      <div
        style={{
          flex: 1,
          ...(horizontal
            ? { height: thickness, minWidth: length }
            : { width: thickness, minHeight: length }),
          backgroundColor: color,
          transform: horizontal ? `scaleX(${q(reveal)})` : `scaleY(${q(reveal)})`,
          transformOrigin: horizontal ? "left" : "top",
        }}
      />
      {head && headProgress > 0 && (
        <div
          style={{
            width: 0,
            height: 0,
            opacity: q(headProgress),
            ...(horizontal
              ? {
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: `9px solid ${color}`,
                }
              : {
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop: `9px solid ${color}`,
                }),
          }}
        />
      )}
    </div>
  );
}

/**
 * All standalone text. Measures itself with the renderer's own text metrics:
 * given `maxWidth`, the size steps down until the line fits, so text never
 * overflows its box or breaks mid-word. Size is floored to an integer — canvas
 * metrics differ in the last ULP between Node and browser, and a fractional
 * size would surface that as a hydration mismatch.
 */
export function Label({
  text,
  size,
  maxWidth,
  weight = 500,
  color,
  family = "Inter, system-ui, sans-serif",
  letterSpacing,
  opacity,
  style,
}: {
  text: string;
  size: number;
  maxWidth?: number;
  weight?: number;
  color?: string;
  family?: string;
  letterSpacing?: CSSProperties["letterSpacing"];
  opacity?: number;
  style?: CSSProperties;
}) {
  // 20px is the readability floor (SCENE-DESIGN-RULES §4) — shrinking below it
  // silently defeated the validation gate, which only sees the literal size
  // prop. Text that cannot fit one line at the floor wraps to two lines
  // instead of vanishing into fine print.
  const FLOOR = 20;
  let fontSize = size;
  let wrapped = false;
  if (maxWidth) {
    const fitted = fitText({
      text,
      withinWidth: maxWidth,
      fontFamily: family,
      fontWeight: String(weight),
    });
    if (fitted.fontSize < FLOOR && text.includes(" ")) {
      wrapped = true;
      const twoLines = fitTextOnNLines({
        text,
        maxLines: 2,
        maxBoxWidth: maxWidth,
        fontFamily: family,
        fontWeight: String(weight),
        maxFontSize: size,
      });
      fontSize = Math.max(FLOOR, Math.min(size, Math.floor(twoLines.fontSize)));
    } else {
      fontSize = Math.max(FLOOR, Math.min(size, Math.floor(fitted.fontSize)));
    }
  }
  return (
    <div
      data-decode-box="text"
      style={{
        fontSize,
        fontWeight: weight,
        color,
        fontFamily: family,
        letterSpacing,
        opacity,
        whiteSpace: maxWidth && !wrapped ? "nowrap" : undefined,
        ...(wrapped ? { maxWidth, lineHeight: 1.35, textAlign: "center" as const } : {}),
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/**
 * A bounded surface: fill, border, radius and padding — the "card" a diagram
 * node renders inside. It sizes to its content, so it flows through Stack/Row
 * instead of needing absolute coordinates.
 */
export function Card({
  background = "#232323",
  border = "#484848",
  radius = 16,
  padding = 16,
  style,
  children,
}: {
  background?: string;
  border?: string;
  radius?: number;
  padding?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      data-decode-box="card"
      style={{
        background,
        border: `2px solid ${border}`,
        borderRadius: radius,
        padding,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Expanded visual vocabulary — still Layer-1: every component below sizes to
 * its content and flows through Stack/Row/Grid, never absolute coordinates.
 * Choreography reaches them by wrapping in <Subject id>, which applies the
 * verb-driven opacity/scale/highlight/dim state from the runtime.
 * ------------------------------------------------------------------------- */

/** A titled grouping box for sub-zones ("Frontend" vs "Backend"). */
export function Container({
  title,
  variant = "solid",
  accent = "#F2A47B",
  padding = 24,
  gap = 16,
  style,
  children,
}: {
  title?: string;
  variant?: "solid" | "dashed" | "accent";
  accent?: string;
  padding?: number;
  gap?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const borderColor = variant === "accent" ? accent : "#484848";
  return (
    <div
      data-decode-box="group"
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        padding,
        border: `2px ${variant === "dashed" ? "dashed" : "solid"} ${borderColor}`,
        borderRadius: 18,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 14,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: variant === "accent" ? accent : "#8A8A86",
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Multi-column alignment without coordinates: CSS grid, equal tracks. */
export function Grid({
  columns,
  gap = 24,
  style,
  children,
}: {
  columns: number;
  gap?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      data-decode-box="group"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(1, Math.floor(columns))}, minmax(0, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const BADGE_COLORS = {
  success: "#8FE6C0",
  warning: "#F2CE72",
  info: "#8A8A86",
} as const;

/** A small inline status chip: "200 OK", "Pending". */
export function Badge({
  variant = "info",
  style,
  children,
}: {
  variant?: keyof typeof BADGE_COLORS;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const color = BADGE_COLORS[variant];
  return (
    <span
      data-decode-box="text"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        border: `1.5px solid ${color}`,
        color,
        fontFamily: "ui-monospace, monospace",
        fontSize: 16,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A pulse travelling along a flow rail — ambient but frame-driven, so it
 * renders identically in preview and export. Sits between two subjects the
 * way Arrow does; `active` freezes to a quiet rail when false.
 */
export function DataStream({
  active = true,
  speed = 1,
  direction = "row",
  length = 96,
  color = "#F2A47B",
  thickness = 2,
  style,
}: {
  active?: boolean;
  speed?: number;
  direction?: "row" | "column";
  length?: number;
  color?: string;
  thickness?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const horizontal = direction === "row";
  const phase = active ? ((frame / fps) * Math.max(0.1, speed)) % 1 : 0;
  const offset = q(phase * (length - 10));
  return (
    <div
      data-decode-box="connector"
      style={{
        position: "relative",
        ...(horizontal
          ? { width: length, height: Math.max(10, thickness) }
          : { height: length, width: Math.max(10, thickness) }),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          ...(horizontal
            ? { left: 0, right: 0, height: thickness, top: "50%", marginTop: -thickness / 2 }
            : { top: 0, bottom: 0, width: thickness, left: "50%", marginLeft: -thickness / 2 }),
          backgroundColor: color,
          opacity: active ? 0.35 : 0.2,
        }}
      />
      {active && (
        <div
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: color,
            ...(horizontal
              ? { left: offset, top: "50%", marginTop: -5 }
              : { top: offset, left: "50%", marginLeft: -5 }),
          }}
        />
      )}
    </div>
  );
}

/** Code with per-line highlight — fixed type, wraps long lines, never scrolls. */
export function CodeBlock({
  code,
  highlightLines = [],
  language,
  fontSize = 20,
  accent = "#F2A47B",
  style,
}: {
  code: string;
  highlightLines?: number[];
  language?: string;
  fontSize?: number;
  accent?: string;
  style?: CSSProperties;
}) {
  // LLM-authored code often arrives with JSON-escaped breaks ("\\n", "\\t") —
  // normalize them so they render as real lines, whatever the serializer did.
  const lines = code
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "  ")
    .replace(/\n$/, "")
    .split("\n");
  const highlighted = new Set(highlightLines);
  return (
    <div
      data-decode-box="card"
      style={{
        background: "#1C1C1C",
        border: "2px solid #484848",
        borderRadius: 14,
        padding: "18px 0",
        fontFamily: "ui-monospace, monospace",
        fontSize,
        lineHeight: 1.6,
        color: "#F0F6F1",
        ...style,
      }}
    >
      {language && (
        <div
          style={{
            padding: "0 22px 10px",
            fontSize: Math.max(12, fontSize * 0.6),
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#8A8A86",
          }}
        >
          {language}
        </div>
      )}
      {lines.map((line, index) => (
        <div
          key={index}
          style={{
            padding: "0 22px",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            backgroundColor: highlighted.has(index + 1) ? "rgba(242, 164, 123, 0.14)" : undefined,
            color: highlighted.has(index + 1) ? accent : undefined,
          }}
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}

/** A stat callout: small label, big tabular number. */
export function MetricCard({
  label,
  value,
  unit,
  style,
}: {
  label: string;
  value: string | number;
  unit?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-decode-box="card"
      style={{
        background: "#232323",
        border: "2px solid #484848",
        borderRadius: 16,
        padding: "20px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 15,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#8A8A86",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 600,
          color: "#F0F6F1",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 22, color: "#8A8A86", marginLeft: 6 }}>{unit}</span>}
      </div>
    </div>
  );
}

/** Shared shell for the domain glyphs below: the SVG stretches to the content
    box, so padding around the label is automatic. */
function GlyphBox({
  label,
  glyph,
  minWidth = 150,
  paddingY = 30,
  style,
}: {
  label: string;
  glyph: ReactNode;
  minWidth?: number;
  paddingY?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      data-decode-box="card"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth,
        padding: `${paddingY}px 34px`,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden
      >
        {glyph}
      </svg>
      <span
        style={{
          position: "relative",
          color: "#F0F6F1",
          fontSize: 24,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** A database cylinder that pads around its label automatically. */
export function Database({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <GlyphBox
      label={label}
      paddingY={34}
      style={style}
      glyph={
        <>
          <path
            d="M 2 14 L 2 86 A 48 12 0 0 0 98 86 L 98 14"
            fill="#232323"
            stroke="#484848"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <ellipse
            cx={50}
            cy={14}
            rx={48}
            ry={12}
            fill="#232323"
            stroke="#484848"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </>
      }
    />
  );
}

/** A queue: a bounded box with waiting slots ahead of the label. */
export function Queue({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div
      data-decode-box="card"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        background: "#232323",
        border: "2px solid #484848",
        borderRadius: 14,
        padding: "20px 28px",
        ...style,
      }}
    >
      <div style={{ display: "flex", gap: 5 }} aria-hidden>
        {[0.35, 0.6, 1].map((slotOpacity) => (
          <div
            key={slotOpacity}
            style={{
              width: 7,
              height: 26,
              borderRadius: 2,
              backgroundColor: "#8A8A86",
              opacity: slotOpacity,
            }}
          />
        ))}
      </div>
      <span style={{ color: "#F0F6F1", fontSize: 24, fontWeight: 600, whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}

/** A cloud boundary that pads around its label automatically. */
export function Cloud({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <GlyphBox
      label={label}
      minWidth={190}
      paddingY={38}
      style={style}
      glyph={
        <path
          d="M 24 82 A 14 16 0 0 1 14 54 A 16 18 0 0 1 30 30 A 20 22 0 0 1 66 22 A 16 18 0 0 1 88 44 A 13 15 0 0 1 82 82 Z"
          fill="#232323"
          stroke="#484848"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      }
    />
  );
}

/** A sequence with connector rails between the steps — order made visible. */
export function Timeline({
  direction = "horizontal",
  gap = 12,
  railLength = 42,
  color = "#484848",
  style,
  children,
}: {
  direction?: "horizontal" | "vertical";
  gap?: number;
  railLength?: number;
  color?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const items = Children.toArray(children);
  const horizontal = direction === "horizontal";
  return (
    <div
      data-decode-box="group"
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        gap,
        ...style,
      }}
    >
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <div
              aria-hidden
              style={{
                backgroundColor: color,
                ...(horizontal
                  ? { width: railLength, height: 2 }
                  : { height: railLength, width: 2 }),
              }}
            />
          )}
          {item}
        </Fragment>
      ))}
    </div>
  );
}

/** The rendered frame's size. Size is not duration, so this one is safe. */
export function useCanvas(): { width: number; height: number } {
  const { width, height } = useVideoConfig();
  return { width, height };
}

export type FormatFamily = "widescreen" | "vertical" | "square" | "portrait" | "custom";

export type Point = { x: number; y: number };

export type Rect = Point & {
  width: number;
  height: number;
};

export type SceneFormat = {
  family: FormatFamily;
  width: number;
  height: number;
  designWidth: number;
  designHeight: number;
  fps: number;
  durationInFrames: number;
  aspectRatio: number;
  safeArea: Rect;
};

const FORMAT_PROFILES: Record<Exclude<FormatFamily, "custom">, {
  ratio: number;
  designWidth: number;
  designHeight: number;
  safeInsetX: number;
  safeInsetY: number;
}> = {
  widescreen: {
    ratio: 16 / 9,
    designWidth: 1920,
    designHeight: 1080,
    safeInsetX: 0.05,
    safeInsetY: 0.06,
  },
  vertical: {
    ratio: 9 / 16,
    designWidth: 1080,
    designHeight: 1920,
    safeInsetX: 0.07,
    safeInsetY: 0.045,
  },
  square: {
    ratio: 1,
    designWidth: 1080,
    designHeight: 1080,
    safeInsetX: 0.06,
    safeInsetY: 0.06,
  },
  portrait: {
    ratio: 4 / 5,
    designWidth: 1080,
    designHeight: 1350,
    safeInsetX: 0.06,
    safeInsetY: 0.05,
  },
};

const FORMAT_TOLERANCE = 0.015;

function formatFamily(width: number, height: number): FormatFamily {
  const ratio = width / height;
  const match = (Object.entries(FORMAT_PROFILES) as Array<
    [Exclude<FormatFamily, "custom">, (typeof FORMAT_PROFILES)[Exclude<FormatFamily, "custom">]]
  >).find(([, profile]) => Math.abs(ratio - profile.ratio) <= FORMAT_TOLERANCE);
  return match?.[0] ?? "custom";
}

function safeAreaForDesign(designWidth: number, designHeight: number): Rect {
  const family = formatFamily(designWidth, designHeight);
  const profile = family === "custom" ? null : FORMAT_PROFILES[family];
  const insetX = profile?.safeInsetX ?? 0.06;
  const insetY = profile?.safeInsetY ?? 0.06;
  return {
    x: q(designWidth * insetX),
    y: q(designHeight * insetY),
    width: q(designWidth * (1 - insetX * 2)),
    height: q(designHeight * (1 - insetY * 2)),
  };
}

function formatFromVideoConfig({
  width,
  height,
  fps,
  durationInFrames,
}: {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}): SceneFormat {
  const family = formatFamily(width, height);
  const profile = family === "custom" ? null : FORMAT_PROFILES[family];
  const designWidth = profile?.designWidth ?? width;
  const designHeight = profile?.designHeight ?? height;
  const safeArea = safeAreaForDesign(designWidth, designHeight);

  return {
    family,
    width,
    height,
    designWidth,
    designHeight,
    fps,
    durationInFrames,
    aspectRatio: q(width / height),
    safeArea,
  };
}

/** Project format plus a canonical design canvas for resolution-independent layouts. */
export function useFormat(): SceneFormat {
  return formatFromVideoConfig(useVideoConfig());
}

/** The format-specific content-safe rectangle in canonical design pixels. */
export function useSafeArea(): Rect {
  return useFormat().safeArea;
}

/**
 * A fixed logical canvas scaled to the actual render resolution. Author a 16:9
 * scene once at 1920x1080 and render it at 720p, 1080p or 4K without changing
 * coordinates. Custom aspect ratios use their actual dimensions.
 */
export function DesignCanvas({
  children,
  style,
}: {
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const format = useFormat();
  const canvasScale = Math.min(
    format.width / format.designWidth,
    format.height / format.designHeight,
  );
  const renderedWidth = format.designWidth * canvasScale;
  const renderedHeight = format.designHeight * canvasScale;

  return (
    <div
      data-decode-design-canvas="true"
      data-design-width={format.designWidth}
      data-design-height={format.designHeight}
      data-safe-x={format.safeArea.x}
      data-safe-y={format.safeArea.y}
      data-safe-width={format.safeArea.width}
      data-safe-height={format.safeArea.height}
      style={{
        ...style,
        position: "absolute",
        left: q((format.width - renderedWidth) / 2),
        top: q((format.height - renderedHeight) / 2),
        width: format.designWidth,
        height: format.designHeight,
        scale: q(canvasScale),
        transformOrigin: "top left",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export type { SpringConfig };

/**
 * A physical spring, in progress units.
 *
 * A normalized convenience over Remotion's frame-based `spring()`. `delay` and
 * `duration` are fractions of the beat (0–1), not frames.
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
 * A slice of the beat in progress units. Use Remotion's re-exported `<Sequence>`
 * when frame units are clearer; use this when the slice should scale with a
 * narration-driven scene duration.
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

/** Quantise values before they reach the DOM so preview and render agree. */
export function q(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(clamp(Math.round(decimals), 0, 12)));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mix(from: number, to: number, progress: number): number {
  return q(from + (to - from) * progress);
}

export function insetRect(rect: Rect, insetX: number, insetY = insetX): Rect {
  return {
    x: q(rect.x + insetX),
    y: q(rect.y + insetY),
    width: q(Math.max(0, rect.width - insetX * 2)),
    height: q(Math.max(0, rect.height - insetY * 2)),
  };
}

export type RectAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export function anchorRect(
  point: Point,
  width: number,
  height: number,
  anchor: RectAnchor = "top-left",
): Rect {
  const horizontal = anchor.endsWith("right") || anchor === "right"
    ? 1
    : anchor.endsWith("left") || anchor === "left"
      ? 0
      : 0.5;
  const vertical = anchor.startsWith("bottom") || anchor === "bottom"
    ? 1
    : anchor.startsWith("top") || anchor === "top"
      ? 0
      : 0.5;

  return {
    x: q(point.x - width * horizontal),
    y: q(point.y - height * vertical),
    width: q(width),
    height: q(height),
  };
}

export type LayoutRegion = {
  /** Normalized top-left position and size in the selected coordinate space. */
  x: number;
  y: number;
  width: number;
  height: number;
  space?: "canvas" | "safe";
};

type LayoutFormat = Pick<SceneFormat, "designWidth" | "designHeight"> &
  Partial<Pick<SceneFormat, "safeArea">>;

/** Resolve normalized planned regions into canonical design-pixel rectangles.
 *
 * `safeArea` is optional only so persisted scenes authored before validation was
 * tightened remain renderable. New generated scenes must pass `useFormat()`.
 */
export function defineLayout<const Regions extends Record<string, LayoutRegion>>(
  format: LayoutFormat,
  regions: Regions,
): { [Key in keyof Regions]: Rect } {
  const canvas: Rect = { x: 0, y: 0, width: format.designWidth, height: format.designHeight };
  const safeArea = format.safeArea ?? safeAreaForDesign(format.designWidth, format.designHeight);
  return Object.fromEntries(
    Object.entries(regions).map(([name, region]) => {
      const bounds = region.space === "safe" ? safeArea : canvas;
      const values = [region.x, region.y, region.width, region.height];
      if (
        values.some((value) => !Number.isFinite(value)) ||
        region.x < 0 ||
        region.y < 0 ||
        region.width < 0 ||
        region.height < 0 ||
        region.x + region.width > 1 ||
        region.y + region.height > 1
      ) {
        throw new Error(
          `Layout region ${JSON.stringify(name)} must fit inside normalized ${region.space ?? "canvas"} bounds.`,
        );
      }
      return [
        name,
        {
          x: q(bounds.x + region.x * bounds.width),
          y: q(bounds.y + region.y * bounds.height),
          width: q(region.width * bounds.width),
          height: q(region.height * bounds.height),
        },
      ];
    }),
  ) as { [Key in keyof Regions]: Rect };
}

export function rectStyle(rect: Rect): CSSProperties {
  return {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    boxSizing: "border-box",
  };
}

export function radialLayout({
  center,
  count,
  radiusX,
  radiusY = radiusX,
  startAngle = -90,
}: {
  center: Point;
  count: number;
  radiusX: number;
  radiusY?: number;
  startAngle?: number;
}): Point[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const radians = ((startAngle + (index * 360) / count) * Math.PI) / 180;
    return {
      x: q(center.x + Math.cos(radians) * radiusX),
      y: q(center.y + Math.sin(radians) * radiusY),
    };
  });
}

export function distributeHorizontal(rect: Rect, count: number, gap = 0): Rect[] {
  if (count <= 0) return [];
  const width = Math.max(0, (rect.width - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: q(rect.x + index * (width + gap)),
    y: rect.y,
    width: q(width),
    height: rect.height,
  }));
}

export function distributeVertical(rect: Rect, count: number, gap = 0): Rect[] {
  if (count <= 0) return [];
  const height = Math.max(0, (rect.height - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: rect.x,
    y: q(rect.y + index * (height + gap)),
    width: rect.width,
    height: q(height),
  }));
}

/** The point where a ray from a rectangle's center toward `target` meets its edge. */
export function pointOnRectEdge(rect: Rect, target: Point, padding = 0): Point {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return { x: q(center.x), y: q(center.y) };

  const halfWidth = Math.max(0, rect.width / 2 + padding);
  const halfHeight = Math.max(0, rect.height / 2 + padding);
  const scaleToEdge = 1 / Math.max(
    Math.abs(dx) / Math.max(halfWidth, Number.EPSILON),
    Math.abs(dy) / Math.max(halfHeight, Number.EPSILON),
  );
  return {
    x: q(center.x + dx * scaleToEdge),
    y: q(center.y + dy * scaleToEdge),
  };
}

export function intersects(first: Rect, second: Rect, minimumGap = 0): boolean {
  return (
    first.x < second.x + second.width + minimumGap &&
    first.x + first.width + minimumGap > second.x &&
    first.y < second.y + second.height + minimumGap &&
    first.y + first.height + minimumGap > second.y
  );
}

export function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

export type CollisionPolicy = "solid" | "overlay" | "background" | "connector";

export function LayoutBox({
  id,
  rect,
  collision = "solid",
  safe = true,
  style,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "id"> & {
  id: string;
  rect?: Rect;
  collision?: CollisionPolicy;
  safe?: boolean;
}) {
  return (
    <div
      {...props}
      data-layout-id={id}
      data-collision={collision}
      data-safe={safe ? "true" : "false"}
      style={{ ...style, ...(rect ? rectStyle(rect) : null) }}
    >
      {children}
    </div>
  );
}

export function LayoutText({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} data-layout-text="true">
      {children}
    </div>
  );
}

export type SceneMoment = number | { at: number; duration?: number };

/** Named moments expressed in normalized scene progress while retaining Remotion's frame clock. */
export function useSceneTiming<const Moments extends Record<string, SceneMoment>>(
  moments: Moments,
) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = durationInFrames <= 1
    ? 0
    : q(clamp(frame / (durationInFrames - 1), 0, 1));
  const range = (name: keyof Moments) => {
    const definition = moments[name];
    const at = typeof definition === "number" ? definition : definition.at;
    const duration = typeof definition === "number" ? 0.1 : definition.duration ?? 0.1;
    return {
      start: clamp(at, 0, 1),
      end: clamp(at + Math.max(0, duration), 0, 1),
    };
  };

  return {
    frame,
    fps,
    durationInFrames,
    seconds: q(frame / fps),
    progress,
    frameAt(name: keyof Moments) {
      return Math.round(range(name).start * Math.max(0, durationInFrames - 1));
    },
    active(name: keyof Moments) {
      return progress >= range(name).start;
    },
    progressOf(name: keyof Moments) {
      const { start, end } = range(name);
      if (end <= start) return progress >= start ? 1 : 0;
      return q(clamp((progress - start) / (end - start), 0, 1));
    },
  };
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

export function Path({
  trimStart = 0,
  trimEnd = 1,
  pathLength = 1,
  ...props
}: Omit<SVGProps<SVGPathElement>, "pathLength"> & {
  trimStart?: number;
  trimEnd?: number;
  pathLength?: number;
}) {
  const start = clamp(trimStart, 0, 1);
  const end = clamp(trimEnd, start, 1);
  const total = Math.max(Number.EPSILON, pathLength);
  const visible = (end - start) * total;
  return (
    <path
      {...props}
      pathLength={pathLength}
      strokeDasharray={`${q(visible)} ${q(Math.max(0, total - visible))}`}
      strokeDashoffset={q(-start * total)}
    />
  );
}

const ICONS = {
  "address-book": AddressBook,
  "arrow-right": ArrowRight,
  brain: Brain,
  "chart-bar": ChartBar,
  check: Check,
  cloud: PhosphorCloud,
  code: Code,
  "credit-card": CreditCard,
  cube: Cube,
  database: PhosphorDatabase,
  "file-text": FileText,
  "flow-arrow": FlowArrow,
  "gear-six": GearSix,
  globe: Globe,
  lightning: Lightning,
  lock: Lock,
  "magnifying-glass": MagnifyingGlass,
  play: Play,
  plug: Plug,
  pulse: Pulse,
  question: Question,
  stack: StackIcon,
  users: Users,
  warning: Warning,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: Omit<PhosphorIconProps, "name"> & { name: IconName }) {
  const Component = ICONS[name] ?? Question;
  return <Component aria-hidden={props.alt ? undefined : true} {...props} />;
}

export type LayoutFinding = {
  code: "outside_canvas" | "outside_safe_area" | "collision" | "text_overflow";
  elements: string[];
  message: string;
  overlap?: { width: number; height: number };
};

function domRect(rect: DOMRect): Rect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * Inspect a mounted design canvas. Call this from preview tooling at named
 * moments or representative frames; generated scenes should only annotate
 * elements with LayoutBox/LayoutText and never run inspection themselves.
 */
export function inspectLayout(root: ParentNode): LayoutFinding[] {
  const canvas = root.querySelector<HTMLElement>("[data-decode-design-canvas='true']");
  if (!canvas) return [];

  const findings: LayoutFinding[] = [];
  const canvasBounds = domRect(canvas.getBoundingClientRect());
  const designWidth = Number(canvas.dataset.designWidth) || canvasBounds.width;
  const designHeight = Number(canvas.dataset.designHeight) || canvasBounds.height;
  const scaleX = canvasBounds.width / designWidth;
  const scaleY = canvasBounds.height / designHeight;
  const safeBounds: Rect = {
    x: canvasBounds.x + (Number(canvas.dataset.safeX) || 0) * scaleX,
    y: canvasBounds.y + (Number(canvas.dataset.safeY) || 0) * scaleY,
    width: (Number(canvas.dataset.safeWidth) || designWidth) * scaleX,
    height: (Number(canvas.dataset.safeHeight) || designHeight) * scaleY,
  };
  const boxes = Array.from(canvas.querySelectorAll<HTMLElement>("[data-layout-id]"));

  for (const element of boxes) {
    const id = element.dataset.layoutId ?? "unnamed";
    const bounds = domRect(element.getBoundingClientRect());
    if (!contains(canvasBounds, bounds, 0.5)) {
      findings.push({
        code: "outside_canvas",
        elements: [id],
        message: `${id} extends outside the design canvas.`,
      });
    }
    if (element.dataset.safe === "true" && !contains(safeBounds, bounds, 0.5)) {
      findings.push({
        code: "outside_safe_area",
        elements: [id],
        message: `${id} extends outside the format safe area.`,
      });
    }
  }

  const solid = boxes.filter((element) => element.dataset.collision === "solid");
  for (let firstIndex = 0; firstIndex < solid.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < solid.length; secondIndex += 1) {
      const first = solid[firstIndex];
      const second = solid[secondIndex];
      if (first.contains(second) || second.contains(first)) continue;
      const firstBounds = domRect(first.getBoundingClientRect());
      const secondBounds = domRect(second.getBoundingClientRect());
      if (!intersects(firstBounds, secondBounds)) continue;
      const firstId = first.dataset.layoutId ?? "unnamed";
      const secondId = second.dataset.layoutId ?? "unnamed";
      findings.push({
        code: "collision",
        elements: [firstId, secondId],
        message: `${firstId} overlaps ${secondId}.`,
        overlap: {
          width: q(Math.min(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width) - Math.max(firstBounds.x, secondBounds.x)),
          height: q(Math.min(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) - Math.max(firstBounds.y, secondBounds.y)),
        },
      });
    }
  }

  for (const element of canvas.querySelectorAll<HTMLElement>("[data-layout-text='true']")) {
    if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) {
      continue;
    }
    const owner = element.closest<HTMLElement>("[data-layout-id]");
    const id = owner?.dataset.layoutId ?? "text";
    findings.push({
      code: "text_overflow",
      elements: [id],
      message: `Text overflows ${id}.`,
    });
  }

  return findings;
}

export type SceneFinding = {
  code: "off_frame" | "collision" | "low_coverage" | "text_overflow" | "outside_safe_margin";
  message: string;
};

/**
 * Inspect a mounted generated scene (the primitives stamp `data-decode-box`).
 * `root` is the scene's frame-filling container — its rect IS the frame.
 *
 * Groups police their own children by construction (flex + mandatory gap), so
 * collisions are only tested between independent top-level boxes; connectors
 * are allowed to span. Elements at ~0 opacity are mid-transition and skipped.
 * Coverage is returned as a ratio pair so the caller can judge it across
 * several samples — a staged reveal is legitimately sparse at frame 0.
 */
export function inspectScene(
  root: HTMLElement,
): { findings: SceneFinding[]; coverageX: number; coverageY: number } {
  const frame = root.getBoundingClientRect();
  const findings: SceneFinding[] = [];
  if (frame.width < 2 || frame.height < 2) {
    return { findings, coverageX: 1, coverageY: 1 };
  }
  const tolerance = Math.max(2, frame.width / 200);

  const visible = (el: Element) => {
    const opacity = Number(getComputedStyle(el).opacity);
    return !(opacity < 0.05);
  };
  // SVG roots join the watch: the diagram is free-positioned inside, so the
  // svg's own placement is the off-frame risk the primitives can't police.
  const boxes = Array.from(root.querySelectorAll<HTMLElement>("[data-decode-box], svg")).filter(
    (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && visible(el);
    },
  );

  // The 96px design-pixel safe margin, scaled to the rendered frame.
  const margin = frame.width * (96 / 1920);
  let unionLeft = Infinity;
  let unionTop = Infinity;
  let unionRight = -Infinity;
  let unionBottom = -Infinity;
  for (const el of boxes) {
    const r = el.getBoundingClientRect();
    unionLeft = Math.min(unionLeft, r.left);
    unionTop = Math.min(unionTop, r.top);
    unionRight = Math.max(unionRight, r.right);
    unionBottom = Math.max(unionBottom, r.bottom);
    if (
      r.left < frame.left - tolerance ||
      r.top < frame.top - tolerance ||
      r.right > frame.right + tolerance ||
      r.bottom > frame.bottom + tolerance
    ) {
      findings.push({
        code: "off_frame",
        message: `"${describeBox(el)}" extends outside the frame.`,
      });
    } else if (
      r.left < frame.left + margin - tolerance ||
      r.top < frame.top + margin - tolerance ||
      r.right > frame.right - margin + tolerance ||
      r.bottom > frame.bottom - margin + tolerance
    ) {
      findings.push({
        code: "outside_safe_margin",
        message: `"${describeBox(el)}" sits inside the 96px safe margin.`,
      });
    }
    if (el.dataset?.decodeBox === "text" && el.scrollWidth > el.clientWidth + 1) {
      findings.push({
        code: "text_overflow",
        message: `"${describeBox(el)}" overflows its box.`,
      });
    }
  }

  const topLevel = boxes.filter(
    (el) =>
      el.dataset.decodeBox !== "connector" &&
      !(el.parentElement?.closest("[data-decode-box]") &&
        root.contains(el.parentElement.closest("[data-decode-box]"))),
  );
  for (let a = 0; a < topLevel.length; a += 1) {
    for (let b = a + 1; b < topLevel.length; b += 1) {
      const first = topLevel[a];
      const second = topLevel[b];
      if (first.contains(second) || second.contains(first)) continue;
      const r1 = first.getBoundingClientRect();
      const r2 = second.getBoundingClientRect();
      // Independent groups owe each other 48 design px of separation
      // (SCENE-DESIGN-RULES §2) — near-touching reads as a collision too.
      const minGap = frame.width * (48 / 1920);
      const overlapX = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
      const overlapY = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
      if (overlapX > -minGap && overlapY > -minGap && overlapX > tolerance && overlapY > tolerance) {
        findings.push({
          code: "collision",
          message: `"${describeBox(first)}" overlaps "${describeBox(second)}".`,
        });
      } else if (overlapX > -minGap && overlapY > -minGap) {
        findings.push({
          code: "collision",
          message: `"${describeBox(first)}" and "${describeBox(second)}" are closer than the 48px minimum gap.`,
        });
      }
    }
  }

  const coverageX = boxes.length ? (unionRight - unionLeft) / frame.width : 0;
  const coverageY = boxes.length ? (unionBottom - unionTop) / frame.height : 0;
  return { findings, coverageX, coverageY };
}

function describeBox(el: HTMLElement): string {
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 40) : (el.dataset.decodeBox ?? "element");
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
