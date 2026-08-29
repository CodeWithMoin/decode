// SEED · scatter-plot — points in a 2D space (here: two classes separating into
// clusters, as in a classifier or an embedding space), the dots popping in
// staggered on the narration. Edit the `POINTS` (or generate them), the axis
// labels, the per-point `color` and the `cue` words; keep the Chart
// kind="scatter" composition and the narration-timed axes→points build.
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

// Two clusters, generated once (pure). A deterministic pseudo-scatter — no
// Math.random (it would differ per render and flash a hydration mismatch). x and
// y draw from DIFFERENT hash seeds so each cluster is a round cloud, not a streak.
type P = { x: number; y: number; color: "blue" | "orange" };
const hash = (i: number, seed: number) => {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v); // fractional part → pseudo-random in [0, 1)
};
const jitter = (i: number, seed: number) => Number(((hash(i, seed) - 0.5) * 1.8).toFixed(3));
const CLUSTER_A: P[] = Array.from({ length: 16 }, (_, i) => ({ x: 3 + jitter(i, 1), y: 3 + jitter(i, 2), color: "blue" }));
const CLUSTER_B: P[] = Array.from({ length: 16 }, (_, i) => ({ x: 7 + jitter(i, 5), y: 6 + jitter(i, 9), color: "orange" }));
const POINTS: P[] = [...CLUSTER_A, ...CLUSTER_B];
const POP_IN = 1.4; // seconds all points take to appear

const RECT = { x: 420, y: 200, width: 1080, height: 620 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const popFrom = wordAt(words, "point") ?? wordAt(words, "example") ?? 1.2;
  const progress = voiced ? interpolate(now, [popFrom, popFrom + POP_IN], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart
        kind="scatter"
        data={POINTS}
        xDomain={[0, 10]}
        yDomain={[0, 10]}
        progress={progress}
        yAxisProgress={axesDraw}
        xAxisProgress={axesDraw}
        xLabel="Feature 1"
        yLabel="Feature 2"
        rect={RECT}
      />
    </AbsoluteFill>
  );
}
