// SEED · bar-chart — comparing one value across a few categories (here: final
// accuracy across three optimizers), bars growing from the baseline left→right
// on the narration. Edit the `BARS`, the axis label, the colours and the `cue`
// words to compare different things; keep the Chart kind="bar" composition and
// the narration-timed axes→bars build.
import {
  AbsoluteFill,
  Chart,
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

// One value per category. Each carries its own concept colour so the bar, its
// value and its label share one identity.
const BARS = [
  { label: "SGD", value: 71, color: "blue" as const },
  { label: "Momentum", value: 84, color: "orange" as const },
  { label: "Adam", value: 92, color: "green" as const },
];
const BARS_DRAW = 1.6; // seconds the bars take to build, left to right

const RECT = { x: 460, y: 220, width: 1000, height: 600 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  // Axes draw on first (y up and x right together), then the bars grow in on the
  // word that first names one.
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const buildFrom = wordAt(words, BARS[0].label) ?? 1.2;
  const progress = voiced ? interpolate(now, [buildFrom, buildFrom + BARS_DRAW], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart
        kind="bar"
        bars={BARS}
        yDomain={[0, 100]}
        progress={progress}
        yAxisProgress={axesDraw}
        xAxisProgress={axesDraw}
        showValues
        yLabel="Accuracy %"
        rect={RECT}
      />
    </AbsoluteFill>
  );
}
