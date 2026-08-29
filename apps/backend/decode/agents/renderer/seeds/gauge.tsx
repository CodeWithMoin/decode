// SEED · gauge — a single value on a dial, the needle sweeping to it. Uses Meter.
// Edit `value`/`max`/`label` and the `cue` words; keep the Meter composition and
// the narration-timed sweep.
import { AbsoluteFill, Meter, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const at = wordAt(words, "gauge") ?? wordAt(words, "usage") ?? 0.8;
  const progress = voiced ? interpolate(now, [at, at + 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Meter value={72} max={100} label="CPU usage" suffix="%" color="orange" progress={progress} at={{ x: 960, y: 560 }} />
    </AbsoluteFill>
  );
}
