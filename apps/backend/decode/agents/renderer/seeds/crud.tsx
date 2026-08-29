// SEED · crud — the four database operations on one table, in place: a SELECT
// match, an INSERT (new row), an UPDATE (changed cell) and a DELETE (struck row).
// The seed flips each row's `state` on the narration beat that names the
// operation. Edit `COLUMNS`/`ROWS` and the `cue` words; keep the DataTable
// composition and the narration-timed state changes.
import {
  AbsoluteFill,
  DataTable,
  tokens,
  useCurrentFrame,
  useVideoConfig,
} from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}

const COLUMNS = ["id", "name", "role"];
const ROWS = [
  ["1", "Ada", "admin"],
  ["2", "Lin", "editor"],
  ["3", "Rob", "viewer"],
  ["4", "Sam", "editor"],
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const after = (cue: string, fallback: number) => !voiced || now >= (wordAt(words, cue) ?? fallback);

  // Each operation lands on its narration beat.
  const state = ["normal", "normal", "normal", "normal"] as ("normal" | "match" | "new" | "deleted")[];
  if (after("select", 1.4)) state[1] = "match"; // READ — the query result
  if (after("insert", 2.4)) state[3] = "new"; // CREATE — the added row
  if (after("delete", 4.2)) state[2] = "deleted"; // DELETE — the removed row
  const updated = after("update", 3.2) ? [{ row: 0, col: 2 }] : []; // UPDATE — Ada's role

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        colColors={["blue", "orange", "green"]}
        rowState={state}
        updatedCells={updated}
        accent="blue"
        colW={340}
      />
    </AbsoluteFill>
  );
}
