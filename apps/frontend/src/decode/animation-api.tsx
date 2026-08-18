import type { CSSProperties, HTMLAttributes, ReactNode, SVGProps } from "react";
import {
  AddressBook,
  ArrowRight,
  Brain,
  ChartBar,
  Check,
  Cloud,
  Code,
  CreditCard,
  Cube,
  Database,
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
  Stack,
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
  cloud: Cloud,
  code: Code,
  "credit-card": CreditCard,
  cube: Cube,
  database: Database,
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
  stack: Stack,
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
