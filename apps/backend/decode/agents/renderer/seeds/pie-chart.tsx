// SEED · pie-chart — parts of a whole as slices sweeping in clockwise. Chart
// kind="pie" (axes off). Edit the `SLICES` (label, value, colour) and the `cue`
// words; keep the pie composition and the narration-timed sweep.
import { AbsoluteFill, Chart, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const SLICES = [
  { label: "Mobile", value: 55, color: "blue" as const },
  { label: "Desktop", value: 30, color: "orange" as const },
  { label: "Tablet", value: 15, color: "green" as const },
];
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const drawAt = wordAt(words, "share") ?? wordAt(words, "pie") ?? 0.8;
  const progress = voiced ? interpolate(now, [drawAt, drawAt + 1.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart kind="pie" bars={SLICES} yAxisProgress={0} xAxisProgress={0} progress={progress} rect={{ x: 660, y: 160, width: 600, height: 600 }} />
    </AbsoluteFill>
  );
}
