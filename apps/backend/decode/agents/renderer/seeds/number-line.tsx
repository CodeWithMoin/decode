// SEED · number-line — a 1-D axis with ticks, a point placed on it and an
// optional shaded interval (here: a probability on 0..1). The line draws on
// left→right, then the point lands. Edit the `domain`, `points`, `interval` and
// `cue` words; keep the NumberLine composition and the narration-timed build.
import {
  AbsoluteFill,
  NumberLine,
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

const DRAW = 1.6;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "probability") ?? wordAt(words, "line") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + DRAW], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <NumberLine
        domain={[0, 1]}
        ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
        points={[{ value: 0.7, label: "p = 0.7", color: "orange" }]}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
