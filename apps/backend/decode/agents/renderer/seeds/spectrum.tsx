// SEED · spectrum — a value on a range between two poles, a marker sliding to its
// position (here: the bias–variance trade-off). Edit the pole labels, the
// `value` (0..1), the marker label and the `cue` words; keep the Spectrum
// composition and the narration-timed slide.
import {
  AbsoluteFill,
  Spectrum,
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

const SLIDE = 1.4;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "balance") ?? wordAt(words, "tradeoff") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + SLIDE], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Spectrum
        leftLabel="High bias"
        rightLabel="High variance"
        value={0.5}
        markerLabel="the sweet spot"
        color="green"
        progress={progress}
      />
    </AbsoluteFill>
  );
}
