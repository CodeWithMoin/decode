// SEED · matrix-multiply — a matrix operation as a figure: A · B = C with dimension labels and a sweep highlighting row i of A, column j of B and cell (i,j) of C together. Edit A/B and the highlight.
// Composes MatrixOp. Keep the reveal + the row×col→cell highlight that steps across
// the output; change the matrices, the operator, and the dimension labels.
import {
  AbsoluteFill,
  MatrixOp,
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

const A = [
  [1, 2, 3],
  [4, 5, 6],
];
const B = [
  [7, 8],
  [9, 10],
  [11, 12],
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const build = wordAt(words, "multiply") ?? wordAt(words, "matrix") ?? 0.3;
  const progress = voiced ? interpolate(now, [build, build + 2.2], [0, 1], ease) : 1;
  // After it is built, sweep the highlight across the output cells (row-major).
  const sweepStart = build + 2.4;
  const cells = A.length * (B[0]?.length ?? 1);
  const step = voiced ? interpolate(now, [sweepStart, sweepStart + 2.4], [0, cells], ease) : 0;
  const k = Math.min(cells - 1, Math.floor(step));
  const highlight = now >= sweepStart ? { row: Math.floor(k / (B[0]?.length ?? 1)), col: k % (B[0]?.length ?? 1) } : undefined;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="A matrix multiply" size={40} color={tokens.color.ink} />
      <MatrixOp a={A} b={B} color="blue" highlight={highlight} progress={progress} />
    </AbsoluteFill>
  );
}
