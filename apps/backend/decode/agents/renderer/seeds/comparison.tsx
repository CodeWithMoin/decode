// SEED · comparison — two things set side by side in a table, rows revealing
// as the narration contrasts them. Composes the Table component. Edit the
// columns, row labels, cells, colours and `cue` words to compare something
// else; keep the Table composition and the narration-timed row reveal.
import {
  AbsoluteFill,
  Table,
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

const COLUMNS = ["Batch", "Streaming"];
const COL_COLORS = ["blue", "green"] as const;
const ROW_LABELS = ["Data", "Speed"];
const ROWS = [
  ["Waits for all", "Processes live"],
  ["Slower", "Faster"],
];
const REVEAL = 1.6; // seconds the table takes to build row by row

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const startAt = wordAt(words, "batch") ?? 0.4;

  const progress = voiced
    ? interpolate(now, [startAt, startAt + REVEAL], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  // Highlight the winning CELL per row as the narration names it — not the whole
  // column, since the winner can differ by attribute.
  const liveAt = wordAt(words, "live") ?? 3.6;
  const fasterAt = wordAt(words, "faster") ?? 4.4;
  const highlight: { row: number; col: number }[] = [];
  if (!voiced || now >= liveAt) highlight.push({ row: 0, col: 1 });
  if (!voiced || now >= fasterAt) highlight.push({ row: 1, col: 1 });

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Table
        columns={COLUMNS}
        rows={ROWS}
        rowLabels={ROW_LABELS}
        colColors={[...COL_COLORS]}
        highlight={highlight}
        progress={progress}
        at={{ x: 960, y: 520 }}
      />
    </AbsoluteFill>
  );
}
