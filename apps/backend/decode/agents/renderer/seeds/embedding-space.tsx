// SEED · embedding-space — words placed as points in 2D so similar meanings sit
// together (an embedding). Composes Chart kind="scatter" with labelled points.
// Edit the `POINTS` and cue words; keep the scatter composition.
import { AbsoluteFill, Chart, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
// Two clusters: animals (blue), colours (orange).
const POINTS = [
  { x: 2.5, y: 7, color: "blue" as const }, { x: 3, y: 7.8, color: "blue" as const }, { x: 2, y: 6.2, color: "blue" as const }, { x: 3.4, y: 6.7, color: "blue" as const },
  { x: 7.5, y: 3, color: "orange" as const }, { x: 8, y: 3.6, color: "orange" as const }, { x: 7, y: 2.4, color: "orange" as const }, { x: 8.2, y: 2.8, color: "orange" as const },
];
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const axesDraw = voiced ? interpolate(now, [0.15, 1.1], [0, 1], ease) : 1;
  const at = wordAt(words, "embedding") ?? wordAt(words, "together") ?? 1.2;
  const progress = voiced ? interpolate(now, [at, at + 1.3], [0, 1], ease) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Chart kind="scatter" data={POINTS} xDomain={[0, 10]} yDomain={[0, 10]} progress={progress} yAxisProgress={axesDraw} xAxisProgress={axesDraw} rect={{ x: 460, y: 180, width: 1000, height: 660 }} />
    </AbsoluteFill>
  );
}
