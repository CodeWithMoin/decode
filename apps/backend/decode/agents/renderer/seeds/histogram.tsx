// SEED · histogram — a distribution as adjacent bars (bins touch). Chart
// kind="histogram". Edit the `BINS` and the `cue` words; keep the histogram
// composition and the narration-timed axes→bars build.
import { AbsoluteFill, Chart, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const BINS = [
  { label: "0", value: 2, color: "blue" as const },
  { label: "1", value: 5, color: "blue" as const },
  { label: "2", value: 9, color: "blue" as const },
  { label: "3", value: 13, color: "blue" as const },
  { label: "4", value: 10, color: "blue" as const },
  { label: "5", value: 6, color: "blue" as const },
  { label: "6", value: 3, color: "blue" as const },
];
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const buildFrom = wordAt(words, "distribution") ?? wordAt(words, "histogram") ?? 1.2;
  const progress = voiced ? interpolate(now, [buildFrom, buildFrom + 1.6], [0, 1], ease) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart kind="histogram" bars={BINS} yDomain={[0, 15]} progress={progress} yAxisProgress={axesDraw} xAxisProgress={axesDraw} xLabel="Value" yLabel="Count" rect={{ x: 440, y: 200, width: 1000, height: 600 }} />
    </AbsoluteFill>
  );
}
