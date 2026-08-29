// SEED · queue — a FIFO queue: a row of cells with "front" and "back" pointers,
// where items join at the back and leave from the front. Cells stagger in on the
// narration. Edit the `VALUES`, the cap labels, and the `cue` words; keep the
// Cells orientation="row" + caps composition and the narration-timed build.
import {
  AbsoluteFill,
  Cells,
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

const VALUES = ["A", "B", "C", "D", "E"];
const CELLS = VALUES.map((label) => ({ label }));
const BUILD = 1.5;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "queue") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + BUILD], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Cells
        cells={CELLS}
        orientation="row"
        container="channel"
        caps={[
          { index: 0, label: "front", color: "green" },
          { index: CELLS.length - 1, label: "back", color: "orange" },
        ]}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
