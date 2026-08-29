// SEED · line-chart — a metric moving over time (here: accuracy rising across
// training epochs, then leveling off), the line drawing on left→right with a
// dot on its leading edge. Edit the `series` function, the axis labels, the
// `color` and the `cue` words to plot a different trend; keep the Chart
// kind="line" composition and the narration-timed axes→line build.
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

// A learning curve: rises fast, then saturates near 95%. Sampled once (pure).
const acc = (epoch: number) => 95 * (1 - Math.exp(-epoch / 6));
const DATA = Array.from({ length: 40 }, (_, i) => {
  const x = (i / 39) * 30; // 30 epochs
  return { x: Number(x.toFixed(3)), y: Number(acc(x).toFixed(3)) };
});
const LINE_DRAW = 1.8; // seconds the line takes to draw on

const RECT = { x: 420, y: 200, width: 1080, height: 620 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const drawAt = wordAt(words, "rose") ?? wordAt(words, "training") ?? 1.2;
  const progress = voiced ? interpolate(now, [drawAt, drawAt + LINE_DRAW], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart
        kind="line"
        data={DATA}
        xDomain={[0, 30]}
        yDomain={[0, 100]}
        color="green"
        progress={progress}
        markerAt={progress}
        markerOpacity={progress > 0.02 ? 1 : 0}
        yAxisProgress={axesDraw}
        xAxisProgress={axesDraw}
        xLabel="Epoch"
        yLabel="Accuracy %"
        rect={RECT}
      />
    </AbsoluteFill>
  );
}
