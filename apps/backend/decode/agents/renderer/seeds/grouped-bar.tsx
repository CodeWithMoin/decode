// SEED · grouped-bar — two series compared across categories (here: two models on
// three datasets). Chart kind="bar" with `groups` + a legend. Edit `GROUPS`,
// `seriesNames`/`seriesColors` and the cue words; keep the grouped composition and
// the narration-timed build.
import { AbsoluteFill, Chart, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const GROUPS = [
  { label: "MNIST", values: [92, 97] },
  { label: "CIFAR", values: [74, 85] },
  { label: "ImageNet", values: [61, 79] },
];
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const buildFrom = wordAt(words, "compared") ?? wordAt(words, "models") ?? 1.2;
  const progress = voiced ? interpolate(now, [buildFrom, buildFrom + 1.7], [0, 1], ease) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart kind="bar" groups={GROUPS} seriesColors={["blue", "green"]} seriesNames={["Old model", "New model"]} yDomain={[0, 100]} progress={progress} yAxisProgress={axesDraw} xAxisProgress={axesDraw} yLabel="Accuracy %" rect={{ x: 440, y: 200, width: 1040, height: 600 }} />
    </AbsoluteFill>
  );
}
