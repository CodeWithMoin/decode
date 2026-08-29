// SEED · plot-curve — a value moving along a plotted curve (here: a loss curve
// with a point descending to the minimum). Hand-perfected. Edit the `loss`
// function, the axis labels, the `color`, and the `cue` words to plot a
// different curve or trace a different value; keep the Plot + Label composition
// and the narration-timed draw-on and marker motion.
import {
  AbsoluteFill,
  Plot,
  tokens,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  EASE_PRESETS,
} from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

// The curve: a loss with its minimum at weight = 0.7. Sampled once (pure).
const MIN_X = 0.7;
const loss = (x: number) => 0.15 + 3 * (x - MIN_X) * (x - MIN_X);
const DATA = Array.from({ length: 60 }, (_, i) => {
  const x = i / 59;
  return { x, y: loss(x) };
});
const START_X = 0.08; // the point starts high on the left...
const CURVE_DRAW = 1.0; // seconds the curve takes to draw on
const DESCEND = 1.4; // seconds the point takes to walk to the minimum

const PLOT_RECT = { x: 360, y: 200, width: 1200, height: 620 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const drawAt = wordAt(words, "loss") ?? 0.4;
  const descendFrom = wordAt(words, "downhill") ?? 1.8;
  const visibleFrom = wordAt(words, "high") ?? 1.4;

  // Both axes draw on together — y up and x right at once — before the curve.
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const yAxisProgress = axesDraw;
  const xAxisProgress = axesDraw;

  const progress = voiced
    ? interpolate(now, [drawAt, drawAt + CURVE_DRAW], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  // The point rests at START_X, then walks downhill to the minimum.
  const markerAt = voiced
    ? interpolate(now, [descendFrom, descendFrom + DESCEND], [START_X, MIN_X], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : MIN_X;
  // The point fades in when it first appears, then walks downhill.
  const markerOpacity = voiced
    ? interpolate(now, [visibleFrom, visibleFrom + 0.35], [0, 1], ease)
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* Axis titles ride the axes via xLabel/yLabel — anchored by construction,
          never a free Label that drifts into the curve. */}
      <Plot
        data={DATA}
        xDomain={[0, 1]}
        yDomain={[0, 1.8]}
        color="blue"
        progress={progress}
        markerAt={markerAt}
        markerOpacity={markerOpacity}
        yAxisProgress={yAxisProgress}
        xAxisProgress={xAxisProgress}
        xLabel="Weight"
        yLabel="Loss"
        rect={PLOT_RECT}
      />
    </AbsoluteFill>
  );
}
