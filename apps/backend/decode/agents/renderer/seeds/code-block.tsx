// SEED · code-block — a bordered card of code that reveals line by line, with one
// line highlighted as the one that matters. Edit the `LINES`, the `highlight`
// index, the `title`, and the `cue` words; keep the Code composition and the
// narration-timed line reveal.
import {
  AbsoluteFill,
  Code,
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

const LINES = [
  "def relu(x):",
  "    # negative values become zero",
  "    return max(0, x)",
];
const BUILD = 1.6;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "function") ?? wordAt(words, "code") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + BUILD], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Code lines={LINES} highlight={2} title="relu.py" accent="green" progress={progress} width={1040} />
    </AbsoluteFill>
  );
}
