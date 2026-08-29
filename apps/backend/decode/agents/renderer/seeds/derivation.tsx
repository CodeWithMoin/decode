// SEED · derivation — an equation transformed line by line, aligned on "=", each step revealed in turn with a grey note saying what happened (chain rule, substitute). Edit STEPS.
// Composes Derivation. Keep the step-by-step reveal aligned on "="; change the STEPS
// (each `text` is one line split on the first "=") and the notes.
import {
  AbsoluteFill,
  Derivation,
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

const STEPS = [
  { text: "L = (y − ŷ)²" },
  { text: "∂L/∂w = 2(y − ŷ) · ∂ŷ/∂w", note: "chain rule" },
  { text: "∂L/∂w = 2(y − ŷ) · x", note: "ŷ = wx" },
  { text: "w ← w − η · ∂L/∂w", note: "gradient step" },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "loss") ?? wordAt(words, "derive") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 3.4], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Deriving the gradient" size={40} color={tokens.color.ink} />
      <Derivation steps={STEPS} progress={progress} />
    </AbsoluteFill>
  );
}
