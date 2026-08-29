// SEED · overfitting — two loss curves on one chart: training loss keeps
// dropping while validation loss drops then RISES, the gap that IS overfitting.
// Uses Chart kind="line" with `series` (multi-line). Edit the curves, the labels
// and the `cue` words; keep the multi-series composition and the timed draw-on.
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
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}

const EPOCHS = 30;
const base = (e: number) => Math.exp(-e / 7) + 0.06; // both start here
const TRAIN = Array.from({ length: 40 }, (_, i) => {
  const x = (i / 39) * EPOCHS;
  return { x: Number(x.toFixed(3)), y: Number(base(x).toFixed(4)) };
});
const VAL = Array.from({ length: 40 }, (_, i) => {
  const x = (i / 39) * EPOCHS;
  const y = base(x) + 0.025 * Math.max(0, x - 12); // diverges upward after epoch 12
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(4)) };
});
const DRAW = 1.9;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const drawAt = wordAt(words, "training") ?? wordAt(words, "overfitting") ?? 1.2;
  const progress = voiced ? interpolate(now, [drawAt, drawAt + DRAW], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart
        kind="line"
        series={[
          { data: TRAIN, color: "blue", label: "train" },
          { data: VAL, color: "orange", label: "validation" },
        ]}
        xDomain={[0, EPOCHS]}
        yDomain={[0, 1.15]}
        progress={progress}
        yAxisProgress={axesDraw}
        xAxisProgress={axesDraw}
        xLabel="Epoch"
        yLabel="Loss"
        rect={{ x: 420, y: 200, width: 1000, height: 620 }}
      />
    </AbsoluteFill>
  );
}
