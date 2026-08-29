// SEED · matrix-grid — a grid of value cells (here: an attention matrix, each
// cell how strongly one token attends to another). Hand-perfected. Edit the
// `VALUES`, the row/col labels, the `color`, the highlighted cell and the `cue`
// words to show a different matrix; keep the Matrix composition and the
// narration-timed stagger and highlight.
import {
  AbsoluteFill,
  Matrix,
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
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

const TOKENS = ["The", "cat", "sat", "down"];
// Rows = the query token, cols = the key it attends to. `sat` attends most to `cat`.
const VALUES = [
  [0.6, 0.2, 0.1, 0.1],
  [0.1, 0.7, 0.1, 0.1],
  [0.1, 0.7, 0.15, 0.05],
  [0.2, 0.2, 0.2, 0.4],
];
const HL = { row: 2, col: 1 }; // sat -> cat, the strongest link
const STAGGER = 1.2; // seconds the cells take to fill in

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = {
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
    easing: EASE_PRESETS.easeInOut,
  };

  const fillAt = wordAt(words, "scores") ?? 0.5;
  const highlightAt = wordAt(words, "most") ?? 3.2;

  const progress = voiced
    ? interpolate(now, [fillAt, fillAt + STAGGER], [0, 1], ease)
    : 1;
  const highlight = !voiced || now >= highlightAt ? HL : undefined;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Matrix
        values={VALUES}
        color="blue"
        rowLabels={TOKENS}
        colLabels={TOKENS}
        highlight={highlight}
        progress={progress}
        at={{ x: 960, y: 560 }}
      />
    </AbsoluteFill>
  );
}
