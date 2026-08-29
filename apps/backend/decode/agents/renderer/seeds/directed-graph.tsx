// SEED · directed-graph — general nodes joined by directed edges (here: a small
// dependency DAG). The model places nodes with x/y; edges reference them by id.
// Nodes pop in, then edges draw on. Edit the `NODES` (positions, labels, colours)
// and `EDGES` (from/to/variant/label); keep the Graph composition and the
// narration-timed build.
import {
  AbsoluteFill,
  Graph,
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

const NODES = [
  { id: "a", label: "A", x: 620, y: 400, color: "blue" as const },
  { id: "b", label: "B", x: 1000, y: 250, color: "orange" as const },
  { id: "c", label: "C", x: 1000, y: 560, color: "orange" as const },
  { id: "d", label: "D", x: 1380, y: 400, color: "green" as const },
];
const EDGES = [
  { from: "a", to: "b", variant: "straight" as const },
  { from: "a", to: "c", variant: "straight" as const },
  { from: "b", to: "d", variant: "straight" as const },
  { from: "c", to: "d", variant: "straight" as const },
];
const BUILD = 2.4;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const startAt = wordAt(words, "graph") ?? wordAt(words, "nodes") ?? 0.3;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + BUILD], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Graph nodes={NODES} edges={EDGES} layout="positions" progress={progress} />
    </AbsoluteFill>
  );
}
