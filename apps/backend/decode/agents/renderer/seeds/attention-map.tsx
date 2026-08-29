// SEED · attention-map — a token×token attention heatmap: each cell is how much the row token attends to the column token, with axis labels and a colour scale. Edit TOKENS + WEIGHTS (0..1).
// Composes Matrix (colorbar + row/col labels). Keep the row-major reveal; change the
// tokens and the weight grid (values 0..1).
import {
  AbsoluteFill,
  Matrix,
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

const TOKENS = ["The", "cat", "sat", "on", "it"];
const WEIGHTS = [
  [0.7, 0.1, 0.1, 0.05, 0.05],
  [0.1, 0.6, 0.2, 0.05, 0.05],
  [0.05, 0.5, 0.3, 0.1, 0.05],
  [0.05, 0.1, 0.2, 0.55, 0.1],
  [0.05, 0.8, 0.05, 0.05, 0.05],
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "attention") ?? wordAt(words, "weights") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 2.6], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Attention weights" size={40} color={tokens.color.ink} />
      <Matrix values={WEIGHTS} rowLabels={TOKENS} colLabels={TOKENS} color="orange" colorbar progress={progress} />
    </AbsoluteFill>
  );
}
