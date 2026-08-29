// SEED · distribution — a bell curve (here: a normal distribution of a
// measurement), the shaded area washing in under the curve with a dot marking
// the mean at the peak. Edit MEAN/STD, the axis label, the `color` and the
// `cue` words to show a different spread; keep the Chart kind="area"
// composition and the narration-timed axes→curve build.
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

// A gaussian, sampled once (pure). Peak height normalised to 1.
const MEAN = 0;
const STD = 1;
const gauss = (x: number) => Math.exp(-((x - MEAN) * (x - MEAN)) / (2 * STD * STD));
const DATA = Array.from({ length: 61 }, (_, i) => {
  const x = -4 + (i / 60) * 8; // -4σ..+4σ
  return { x: Number(x.toFixed(3)), y: Number(gauss(x).toFixed(4)) };
});
const CURVE_DRAW = 1.6;

const RECT = { x: 360, y: 220, width: 1200, height: 580 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const drawAt = wordAt(words, "distribution") ?? wordAt(words, "cluster") ?? 1.2;
  const progress = voiced ? interpolate(now, [drawAt, drawAt + CURVE_DRAW], [0, 1], ease) : 1;

  // The mean dot rides in with the curve, landing at the peak (x = MEAN, y = 1).
  const meanFrac = (MEAN - -4) / 8; // 0.5 for a centred mean
  const markerShow = wordAt(words, "average") ?? drawAt + CURVE_DRAW;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart
        kind="area"
        data={DATA}
        xDomain={[-4, 4]}
        yDomain={[0, 1.15]}
        color="purple"
        progress={progress}
        markerAt={meanFrac}
        markerOpacity={voiced ? interpolate(now, [markerShow, markerShow + 0.35], [0, 1], ease) : 1}
        xLabel="Standard deviations"
        yAxisProgress={axesDraw}
        xAxisProgress={axesDraw}
        rect={RECT}
      />
    </AbsoluteFill>
  );
}
