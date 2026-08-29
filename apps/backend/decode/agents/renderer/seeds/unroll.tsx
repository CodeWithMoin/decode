// SEED · unroll — a recurrence unrolled across time: identical cells passing a hidden state left→right, with per-step inputs below and outputs above (an RNN, or diffusion steps). Edit CELLS.
// Composes Unroll. Keep the left→right build and the hidden-state arrows; change the
// shared cell label and the per-step inputs/outputs.
import {
  AbsoluteFill,
  Unroll,
  Label,
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

const CELLS = [
  { input: "x₁", output: "y₁" },
  { input: "x₂", output: "y₂" },
  { input: "x₃", output: "y₃" },
  { input: "x₄", output: "y₄" },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "unrolled") ?? wordAt(words, "step") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 3.0], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="An RNN, unrolled in time" size={40} color={tokens.color.ink} />
      <Unroll cells={CELLS} cellLabel="RNN" color="blue" progress={progress} />
    </AbsoluteFill>
  );
}
