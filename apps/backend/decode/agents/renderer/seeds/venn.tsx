// SEED · venn — two overlapping sets, the intersection labelled. Edit the `SETS`
// and `overlapLabel` and the `cue` words; keep the Venn composition and the
// narration-timed fade-in.
import { AbsoluteFill, Venn, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const SETS = [
  { label: "Frontend", color: "blue" as const },
  { label: "Backend", color: "orange" as const },
];
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const at = wordAt(words, "overlap") ?? wordAt(words, "both") ?? 0.6;
  const progress = voiced ? interpolate(now, [at, at + 1.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Venn sets={SETS} overlapLabel="Full-stack" progress={progress} />
    </AbsoluteFill>
  );
}
