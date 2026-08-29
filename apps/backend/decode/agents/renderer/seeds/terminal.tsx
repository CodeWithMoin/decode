// SEED · terminal — a terminal card where commands TYPE out and output reveals line by line (install, then train). Edit the LINES (kind: "cmd" types, "out"/"comment" fade in).
// Composes Terminal. Keep the line-by-line reveal; change the title and the LINES.
import {
  AbsoluteFill,
  Terminal,
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
  { text: "pip install torch", kind: "cmd" as const },
  { text: "Successfully installed torch-2.3.0", kind: "out" as const },
  { text: "python train.py", kind: "cmd" as const },
  { text: "epoch 1   loss 0.68", kind: "out" as const },
  { text: "epoch 2   loss 0.41", kind: "out" as const },
  { text: "epoch 3   loss 0.22   done", kind: "out" as const },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "install") ?? wordAt(words, "run") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 4.2], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Terminal title="bash" lines={LINES} fontSize={28} progress={progress} />
    </AbsoluteFill>
  );
}
